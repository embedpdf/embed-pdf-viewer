/**
 * Placement: arm an asset on a document (the next click places) or place it
 * without the pointer. Form-backed stamps are executable templates only
 * until placement — they are evaluated on an isolated copy under the target
 * document's detached script realm, so neither the canonical library nor
 * its reusable per-page extraction becomes target/user/time specific.
 */
import { toPluginError, toPluginErrorInfo } from '@embedpdf/core';
import { javaScriptProgramFromActionTree } from '@embedpdf/core-acrojs';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import { AnnotationToken, type StampPlacement } from '@embedpdf/plugin-annotation/contract';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { createFormScriptingController } from '@embedpdf/plugin-form/scripting';

import type { StampAsset, StampAssetPreview, StampCapability, StampConfig } from '../contract';
import type { StampContext, StampServices } from '../services';
import { DEFAULT_PREVIEW_WIDTH } from '../services/asset-engine';

export function createPlacement(
  ctx: StampContext,
  {
    events,
    binaries,
    assetEngine,
    ghosts,
  }: Pick<StampServices, 'events' | 'binaries' | 'assetEngine' | 'ghosts'>,
  config: StampConfig,
) {
  const { armChanged } = events;
  const { binaries: assetBinaries, libraryBinaries } = binaries;
  const { openAssetDocument, imageToPreview } = assetEngine;
  const { ghostProvider } = ghosts;

  /** Which asset this plugin armed per document. The annotation plugin owns
   *  the arm itself (a tool switch disarms it), so the answer is checked
   *  against it and forgotten once it no longer holds one. */
  const armedByDocument = new Map<string, string>();

  /** The one payload both entry points hand the annotation plugin: artwork,
   *  a resolution-aware ghost, true size, and the identity a placement
   *  writes (`/Name` = identifier, `/Subj` = the subject override or label). */
  const stampPayload = (
    asset: StampAsset,
    placement: { bytes: Uint8Array; preview: StampAssetPreview | null },
    materialized: boolean,
  ) => ({
    source: placement.bytes,
    preview: ghostProvider(placement.bytes, placement.preview, materialized ? null : asset.id),
    intrinsicSize: asset.size,
    name: asset.name,
    subject: asset.subject ?? asset.label,
  });

  /**
   * Form-backed stamps are executable templates only until placement. Work
   * on an isolated copy so neither the canonical library nor its reusable
   * per-page extraction becomes target/user/time specific.
   *
   * The realm comes from the TARGET document's actions plugin — a detached
   * realm under that document's policy and environment (WP4: its own
   * sandbox, none of the viewer realm's globals). No actions plugin, or
   * scripting off, or `dynamic: false` → the template is armed as-is.
   */
  const materializeForPlacement = async (
    documentId: string,
    asset: StampAsset,
    bin: { bytes: Uint8Array; preview: StampAssetPreview | null },
  ): Promise<{ bytes: Uint8Array; preview: StampAssetPreview | null }> => {
    if (config.dynamic === false) return bin;
    const actions = ctx.tryForDocument(ActionsHostToken, documentId);
    const mintRealm = actions?.createDetachedScriptRealm;
    if (!actions || !mintRealm) return bin;

    const targetMeta = ctx.core().documents[documentId] ?? null;
    if (!targetMeta) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `[stamp] target document '${documentId}' is not open`,
      );
    }

    // A page extraction intentionally does not retain catalog-owned AcroForm
    // and action structures. Canonical assets therefore evaluate from the
    // whole library PDF, then extract only their selected page after flatten.
    const canonicalBytes = libraryBinaries.get(asset.libraryId);
    const sourceBytes = canonicalBytes ?? bin.bytes;
    const doc = await openAssetDocument(new Uint8Array(sourceBytes));
    // Cleanup protection starts the moment the temporary document exists:
    // realm/controller construction failures must not leak it.
    let realm: ReturnType<typeof mintRealm> | null = null;
    let scripting: ReturnType<typeof createFormScriptingController> | null = null;
    try {
      const layout = await doc.pages.list();
      const selectedPage =
        asset.page === undefined
          ? layout.pageCount === 1
            ? layout.pages[0]
            : undefined
          : layout.pages.find(({ ref }) => ref.pageObjectNumber === asset.page.pageObjectNumber);
      if (!selectedPage) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          canonicalBytes
            ? `[stamp] canonical page ${asset.page?.pageObjectNumber ?? 'unknown'} no longer exists`
            : '[stamp] a loose dynamic stamp asset must contain exactly one page',
        );
      }
      const snapshot = await doc.forms.list();
      const hasSelectedPageField = snapshot.fields.some((field) =>
        field.widgets.some(
          ({ page }) => page?.pageObjectNumber === selectedPage.ref.pageObjectNumber,
        ),
      );
      if (!hasSelectedPageField) return bin;
      if (!doc.pages.flatten || !doc.pages.extract) {
        throw new EngineError(
          EngineErrorCode.NotImplemented,
          '[stamp] dynamic PDF stamps need an asset engine with pages.flatten and pages.extract',
        );
      }

      // Scripts observe the TARGET document's metadata (Acrobat's dynamic
      // stamp contract: `documentFileName` is the document being stamped)
      // and boot from the asset document's own name tree.
      realm = mintRealm.call(actions, {
        doc,
        document: () => targetMeta,
        bootSources: async () => {
          const tree = doc.actions ? await doc.actions.read() : null;
          return (
            tree?.nameTreeScripts.map(({ action }) => javaScriptProgramFromActionTree(action)) ?? []
          );
        },
      });
      scripting = createFormScriptingController({
        doc,
        document: () => targetMeta,
        transaction: realm.transaction.bind(realm),
        budget: realm.budget,
      });
      const result = await scripting.recalculate();
      actions.surfaceScriptCommit(result, { origin: 'user', realm: 'detached' });
      if (result.status === 'failed') {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `[stamp] dynamic stamp scripting failed: ${result.error?.message ?? 'native form effect failed'}`,
        );
      }

      const page = selectedPage.ref;
      const flattened = await doc.pages.flatten([page], 'display');
      const failed = flattened.results.find(
        ({ status }) => status === 'failed' || status === 'skipped',
      );
      if (failed) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `[stamp] dynamic stamp flatten failed for page ${failed.page.pageObjectNumber}`,
        );
      }

      const bytes = await doc.pages.extract([page]);
      const image = await doc.page(page).render.image({
        viewport: { kind: 'width', width: config.previewWidth ?? DEFAULT_PREVIEW_WIDTH },
        background: 'transparent',
        includeAnnotations: false,
        format: 'png',
      });
      return { bytes, preview: imageToPreview(image) };
    } finally {
      scripting?.dispose();
      realm?.dispose();
      await doc.close();
    }
  };

  const armAsset = async (
    documentId: string,
    assetId: string,
    opts?: { targetWidth?: number },
  ): Promise<void> => {
    const asset = ctx.getState().assets[assetId];
    const bin = assetBinaries.get(assetId);
    if (!asset || !bin) {
      throw new EngineError(EngineErrorCode.NotFound, `[stamp] unknown asset '${assetId}'`);
    }
    const placement = await materializeForPlacement(documentId, asset, bin);
    // The placement itself remains one armStamp call. Dynamic evaluation,
    // when enabled and applicable, has already produced an ephemeral static
    // page and matching preview at this boundary.
    const annotation = ctx.forDocument(AnnotationToken, documentId);
    await annotation.armStamp({
      ...stampPayload(asset, placement, placement !== bin),
      targetWidth: opts?.targetWidth,
    });
    armedByDocument.set(documentId, assetId);
    armChanged.emit({ documentId, assetId });
  };

  const armedAsset = (documentId: string): StampAsset | null => {
    const assetId = armedByDocument.get(documentId);
    if (assetId === undefined) return null;
    // Pure: a stale entry (the annotation plugin dropped the payload on a tool
    // change) reads as nothing armed and is overwritten by the next arm.
    const annotation = ctx.tryForDocument(AnnotationHostToken, documentId);
    if (!annotation?.hasArmedStamp()) return null;
    return ctx.getState().assets[assetId] ?? null;
  };

  const placeAsset = async (
    documentId: string,
    assetId: string,
    placement: StampPlacement,
  ): Promise<AnnotationRef> => {
    const asset = ctx.getState().assets[assetId];
    const bin = assetBinaries.get(assetId);
    if (!asset || !bin) {
      throw new EngineError(EngineErrorCode.NotFound, `[stamp] unknown asset '${assetId}'`);
    }
    const materialized = await materializeForPlacement(documentId, asset, bin);
    const annotation = ctx.forDocument(AnnotationToken, documentId);
    return annotation.placeStamp(
      stampPayload(asset, materialized, materialized !== bin),
      placement,
    );
  };

  return {
    api: {
      armAsset,
      placeAsset,
      placeAssetOnPages: async (documentId, assetId, pages, placement) => {
        const targets =
          pages === 'all'
            ? (ctx.core().documents[documentId]?.pages ?? []).map((p) => p.ref)
            : [...pages];
        const applied: AnnotationRef[] = [];
        const failed: { ref: PageRef; error: ReturnType<typeof toPluginErrorInfo> }[] = [];
        for (const page of targets) {
          try {
            applied.push(await placeAsset(documentId, assetId, { ...placement, page }));
          } catch (error) {
            failed.push({ ref: page, error: toPluginErrorInfo(toPluginError('stamp', error)) });
          }
        }
        return { applied, skipped: [], failed };
      },
      disarm: (documentId) => {
        const was = armedByDocument.get(documentId) ?? null;
        armedByDocument.delete(documentId);
        ctx.forDocument(AnnotationToken, documentId).disarmStamp();
        if (was !== null) armChanged.emit({ documentId, assetId: null });
      },
      getArmedAsset: armedAsset,
    } satisfies Partial<StampCapability>,
  };
}
