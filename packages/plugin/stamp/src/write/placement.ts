/**
 * Placement: arm an asset on a document (the next click places) or place it
 * without the pointer. Form-backed stamps are executable templates only
 * until placement — they are evaluated on an isolated copy under the target
 * document's detached script realm, so neither the canonical library nor
 * its reusable per-page extraction becomes target/user/time specific.
 */
import { DocumentsToken, toPluginError, toPluginErrorInfo } from '@embedpdf/core';
import { javaScriptProgramFromActionTree } from '@embedpdf/core-acrojs';
import type { AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import { AnnotationToken, type StampPlacement } from '@embedpdf/plugin-annotation/contract';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { createFormScriptingController } from '@embedpdf/plugin-form/scripting';

import type { StampAsset, StampAssetPreview, StampCapability, StampConfig } from '../contract';
import type { StampContext, StampServices } from '../services';
import { DEFAULT_PREVIEW_WIDTH } from '../services/asset-engine';
import { notFound, stampError, verb } from '../services/errors';

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

  /** Which asset this plugin armed per document, a resource read by
   *  `getArmedAsset`. The annotation plugin owns the arm itself (a tool
   *  switch disarms it), so a read checks the entry against it. */
  const armedByDocument = new Map<string, string>();

  // The annotation plugin drops an arm on its own (a tool switch, a closed
  // document). Forget those arms here too, so readers of `getArmedAsset`
  // wake and `onArmChanged` announces the disarm.
  const droppedArms = (): string =>
    [...armedByDocument.keys()]
      .filter((documentId) => !ctx.tryForDocument(AnnotationHostToken, documentId)?.hasArmedStamp())
      .join('\n');
  ctx.watch(droppedArms, (dropped) => {
    if (!dropped) return;
    for (const documentId of dropped.split('\n')) armedByDocument.delete(documentId);
    ctx.notify();
    for (const documentId of dropped.split('\n')) armChanged.emit({ documentId, assetId: null });
  });

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
   * The realm comes from the target document's actions plugin: a detached
   * realm under that document's policy and environment, with its own
   * sandbox and none of the viewer realm's globals. No actions plugin,
   * scripting off, or `dynamic: false`: the template is armed as-is.
   */
  const materializeForPlacement = async (
    documentId: string,
    asset: StampAsset,
    binary: { bytes: Uint8Array; preview: StampAssetPreview | null },
  ): Promise<{ bytes: Uint8Array; preview: StampAssetPreview | null }> => {
    if (config.dynamic === false) return binary;
    const actions = ctx.tryForDocument(ActionsHostToken, documentId);
    const mintRealm = actions?.createDetachedScriptRealm;
    if (!actions || !mintRealm) return binary;

    const documents = ctx.get(DocumentsToken);
    const target = documents.get(documentId);
    if (target?.status !== 'ready') {
      throw stampError('not-found', `target document '${documentId}' is not open`);
    }
    const targetDocument = {
      name: target.name,
      pageCount: target.pageCount,
      pages: documents.listPages(documentId),
    };

    // A page extraction intentionally does not retain catalog-owned AcroForm
    // and action structures. Canonical assets therefore evaluate from the
    // whole library PDF, then extract only their selected page after flatten.
    const canonicalBytes = libraryBinaries.get(asset.libraryId);
    const sourceBytes = canonicalBytes ?? binary.bytes;
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
        throw stampError(
          'invalid-input',
          canonicalBytes
            ? `canonical page ${asset.page?.pageObjectNumber ?? 'unknown'} no longer exists`
            : 'a loose dynamic stamp asset must contain exactly one page',
        );
      }
      const snapshot = await doc.forms.list();
      const hasSelectedPageField = snapshot.fields.some((field) =>
        field.widgets.some(
          ({ page }) => page?.pageObjectNumber === selectedPage.ref.pageObjectNumber,
        ),
      );
      if (!hasSelectedPageField) return binary;
      if (!doc.pages.flatten || !doc.pages.extract) {
        throw stampError(
          'unsupported',
          'dynamic PDF stamps need an asset engine with pages.flatten and pages.extract',
        );
      }

      // Scripts observe the target document's metadata (Acrobat's dynamic
      // stamp contract: `documentFileName` is the document being stamped)
      // and boot from the asset document's own name tree.
      realm = mintRealm.call(actions, {
        doc,
        document: () => targetDocument,
        bootSources: async () => {
          const tree = doc.actions ? await doc.actions.get() : null;
          return (
            tree?.nameTreeScripts.map(({ action }) => javaScriptProgramFromActionTree(action)) ?? []
          );
        },
      });
      scripting = createFormScriptingController({
        doc,
        document: () => targetDocument,
        transaction: realm.transaction.bind(realm),
        budget: realm.budget,
      });
      const result = await scripting.recalculate();
      actions.surfaceScriptCommit(result, { origin: 'user', realm: 'detached' });
      if (result.status === 'failed') {
        throw stampError(
          'operation-failed',
          `dynamic stamp scripting failed: ${result.error?.message ?? 'native form effect failed'}`,
        );
      }

      const page = selectedPage.ref;
      const flattened = await doc.pages.flatten([page], 'display');
      const failed = flattened.results.find(
        ({ status }) => status === 'failed' || status === 'skipped',
      );
      if (failed) {
        throw stampError(
          'operation-failed',
          `dynamic stamp flatten failed for page ${failed.page.pageObjectNumber}`,
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
    options?: { targetWidth?: number },
  ): Promise<void> => {
    const asset = ctx.state.get().assets[assetId];
    const binary = assetBinaries.get(assetId);
    if (!asset || !binary) throw notFound('asset', assetId);
    const placement = await materializeForPlacement(documentId, asset, binary);
    // The placement itself remains one armStamp call. Dynamic evaluation,
    // when enabled and applicable, has already produced an ephemeral static
    // page and matching preview at this boundary.
    const annotation = ctx.forDocument(AnnotationToken, documentId);
    await annotation.armStamp({
      ...stampPayload(asset, placement, placement !== binary),
      targetWidth: options?.targetWidth,
    });
    armedByDocument.set(documentId, assetId);
    ctx.notify();
    armChanged.emit({ documentId, assetId });
  };

  const armedAsset = (documentId: string): StampAsset | null => {
    const assetId = armedByDocument.get(documentId);
    if (assetId === undefined) return null;
    // An arm the annotation plugin just dropped reads as nothing armed, even
    // for a reader that runs before the watch above forgets it.
    const annotation = ctx.tryForDocument(AnnotationHostToken, documentId);
    if (!annotation?.hasArmedStamp()) return null;
    return ctx.state.get().assets[assetId] ?? null;
  };

  const placeAsset = async (
    documentId: string,
    assetId: string,
    placement: StampPlacement,
  ): Promise<AnnotationRef> => {
    const asset = ctx.state.get().assets[assetId];
    const binary = assetBinaries.get(assetId);
    if (!asset || !binary) throw notFound('asset', assetId);
    const materialized = await materializeForPlacement(documentId, asset, binary);
    const annotation = ctx.forDocument(AnnotationToken, documentId);
    return annotation.placeStamp(
      stampPayload(asset, materialized, materialized !== binary),
      placement,
    );
  };

  return {
    api: {
      armAsset: verb(armAsset),
      placeAsset: verb(placeAsset),
      placeAssetOnPages: async (documentId, assetId, pages, placement) => {
        const targets =
          pages === 'all'
            ? ctx
                .get(DocumentsToken)
                .listPages(documentId)
                .map((page) => page.ref)
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
        const wasArmed = armedByDocument.delete(documentId);
        if (wasArmed) ctx.notify();
        ctx.forDocument(AnnotationToken, documentId).disarmStamp();
        if (wasArmed) armChanged.emit({ documentId, assetId: null });
      },
      getArmedAsset: armedAsset,
    } satisfies Partial<StampCapability>,
  };
}
