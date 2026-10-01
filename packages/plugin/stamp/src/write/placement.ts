/**
 * Placement: arm an asset on a document (the next click places) or place it
 * without the pointer. Form-backed stamps are executable templates only
 * until placement — they are evaluated on an isolated copy under the target
 * document's detached script realm, so neither the canonical library nor
 * its reusable per-page extraction becomes target/user/time specific.
 */
import {
  DocumentsToken,
  toPluginError,
  toPluginErrorInfo,
  type BatchResult,
  type PageRef,
} from '@embedpdf/core';
import { javaScriptProgramFromActionTree } from '@embedpdf/core-acrojs';
import type { Annotation } from '@embedpdf/engine-core/runtime';
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import { AnnotationToken, type StampPlacement } from '@embedpdf/plugin-annotation/contract';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { createFormScriptingController } from '@embedpdf/plugin-form/scripting';

import type {
  StampArmOptions,
  StampAsset,
  StampAssetPreview,
  StampCapability,
  StampDocumentOptions,
} from '../contract';
import { armAsset as rememberArm, disarmDocuments } from '../model';
import type { StampCatalog } from '../read/catalog';
import type { StampContext, StampServices } from '../services';
import { notFound, permissionDenied, stampError, throwIfCancelled, verb } from '../services/errors';

export function createPlacement(
  ctx: StampContext,
  {
    binaries,
    assetEngine,
    ghosts,
    targets,
  }: Pick<StampServices, 'binaries' | 'assetEngine' | 'ghosts' | 'targets'>,
  { canPlace }: Pick<StampCatalog, 'canPlace'>,
) {
  const { binaries: assetBinaries, libraryBinaries } = binaries;
  const { openAssetDocument, imageToPreview } = assetEngine;
  const { ghostProvider } = ghosts;
  const { documentIdOf, targetOf, pageOf } = targets;
  const settings = ctx.settings();

  // The annotation plugin owns the arm itself and drops it on its own (a
  // tool switch, a closed document). Forget those arms here too, so
  // `getArmedAsset` and `onArmChanged` follow.
  const droppedArms = (): string =>
    Object.keys(ctx.state.get().armed)
      .filter(
        (documentId) => !ctx.tryForDocument(AnnotationHostToken, documentId)?.stamps.isArmed(),
      )
      .join('\n');
  ctx.watch(droppedArms, (dropped) => {
    if (dropped) ctx.state.update(disarmDocuments, dropped.split('\n'));
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
    if (!settings.get().dynamic) return binary;
    const actions = ctx.tryForDocument(ActionsHostToken, documentId);
    const mintRealm = actions?.createDetachedScriptRealm;
    if (!actions || !mintRealm) return binary;

    const documents = ctx.get(DocumentsToken);
    const target = documents.get(documentId);
    if (target?.status !== 'ready') {
      throw stampError('not-found', `document '${documentId}' is not open`);
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
          : layout.pages.find(({ ref }) => ref.objectNumber === asset.page.objectNumber);
      if (!selectedPage) {
        throw stampError(
          'invalid-input',
          canonicalBytes
            ? `canonical page ${asset.page?.objectNumber ?? 'unknown'} no longer exists`
            : 'a loose dynamic stamp asset must contain exactly one page',
        );
      }
      const snapshot = await doc.forms.list();
      const hasSelectedPageField = snapshot.fields.some((field) =>
        field.widgets.some(({ page }) => page?.objectNumber === selectedPage.ref.objectNumber),
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
      const flattened = await doc.pages.flatten([page], { usage: 'display' });
      const failed = flattened.results.find(
        ({ status }) => status === 'failed' || status === 'skipped',
      );
      if (failed) {
        throw stampError(
          'operation-failed',
          `dynamic stamp flatten failed for page ${failed.page.objectNumber}`,
        );
      }

      const bytes = await doc.pages.extract([page]);
      const image = await doc.page(page).render.image({
        viewport: { kind: 'width', width: settings.get().previewWidth },
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

  /** An asset and its bytes, or `not-found`. */
  const assetOf = (assetId: string) => {
    const asset = ctx.state.get().assets[assetId];
    const binary = assetBinaries.get(assetId);
    if (!asset || !binary) throw notFound('asset', assetId);
    return { asset, binary };
  };

  /** Placing is annotation work: refused where the document's annotation plugin refuses a create. */
  const assertMayPlace = (documentId: string, operation: string): void => {
    if (!canPlace(documentId)) throw permissionDenied('annotations:create', operation);
  };

  const armAsset = async (assetId: string, options?: StampArmOptions): Promise<void> => {
    const signal = options?.signal;
    throwIfCancelled(signal);
    const documentId = targetOf(options);
    const { asset, binary } = assetOf(assetId);
    assertMayPlace(documentId, 'stamp.armAsset');
    const placement = await ctx.cancellable(
      signal,
      materializeForPlacement(documentId, asset, binary),
    );
    throwIfCancelled(signal);
    // The placement itself remains one `stamps.arm` call. Dynamic evaluation,
    // when enabled and applicable, has already produced an ephemeral static
    // page and matching preview at this boundary.
    const annotation = ctx.forDocument(AnnotationToken, documentId);
    await annotation.stamps.arm(
      {
        ...stampPayload(asset, placement, placement !== binary),
        targetWidth: options?.targetWidth,
      },
      { signal },
    );
    ctx.state.update(rememberArm, documentId, assetId);
  };

  const getArmedAsset = (documentId?: string): StampAsset | null => {
    const id = documentIdOf(documentId);
    const assetId = id === null ? undefined : ctx.state.get().armed[id];
    if (id === null || assetId === undefined) return null;
    // An arm the annotation plugin just dropped reads as nothing armed, even
    // for a reader that runs before the watch above forgets it.
    if (!ctx.tryForDocument(AnnotationHostToken, id)?.stamps.isArmed()) return null;
    return ctx.state.get().assets[assetId] ?? null;
  };

  const disarm = (documentId?: string): void => {
    const id = documentIdOf(documentId);
    if (id === null) return;
    ctx.tryForDocument(AnnotationToken, id)?.stamps.disarm();
    ctx.state.update(disarmDocuments, [id]);
  };

  /** Place on one document, its permission already checked. */
  const placeOn = async (
    documentId: string,
    assetId: string,
    placement: StampPlacement,
    signal: AbortSignal | undefined,
  ): Promise<{ annotation: Annotation }> => {
    const { asset, binary } = assetOf(assetId);
    const materialized = await ctx.cancellable(
      signal,
      materializeForPlacement(documentId, asset, binary),
    );
    throwIfCancelled(signal);
    const annotation = ctx.forDocument(AnnotationToken, documentId);
    return annotation.stamps.place(
      stampPayload(asset, materialized, materialized !== binary),
      placement,
      { signal },
    );
  };

  const placeAsset = async (
    assetId: string,
    placement: StampPlacement,
    options?: StampDocumentOptions,
  ): Promise<{ annotation: Annotation }> => {
    throwIfCancelled(options?.signal);
    const documentId = targetOf(options);
    assetOf(assetId);
    assertMayPlace(documentId, 'stamp.placeAsset');
    return placeOn(documentId, assetId, placement, options?.signal);
  };

  const placeAssetOnPages = async (
    assetId: string,
    pages: readonly (PageRef | number)[] | 'all',
    placement: Omit<StampPlacement, 'page'>,
    options?: StampDocumentOptions,
  ): Promise<BatchResult<Annotation, PageRef>> => {
    const signal = options?.signal;
    throwIfCancelled(signal);
    const documentId = targetOf(options);
    assetOf(assetId);
    assertMayPlace(documentId, 'stamp.placeAssetOnPages');
    // Every page is resolved before the first placement: a page that isn't
    // there refuses the call, and nothing is placed.
    const targetPages =
      pages === 'all'
        ? ctx
            .get(DocumentsToken)
            .listPages(documentId)
            .map((page) => page.ref)
        : pages.map((page) => pageOf(documentId, page).ref);
    const applied: Annotation[] = [];
    const failed: { ref: PageRef; error: ReturnType<typeof toPluginErrorInfo> }[] = [];
    for (const page of targetPages) {
      try {
        const placed = await placeOn(documentId, assetId, { ...placement, page }, signal);
        applied.push(placed.annotation);
      } catch (error) {
        const refused = toPluginError('stamp', error);
        // A cancel stops the whole batch: what was placed stays placed.
        if (refused.code === 'operation-cancelled') throw refused;
        failed.push({ ref: page, error: toPluginErrorInfo(refused) });
      }
    }
    return { applied, skipped: [], failed };
  };

  return {
    api: {
      armAsset: verb(armAsset),
      disarm,
      getArmedAsset,
      placeAsset: verb(placeAsset),
      placeAssetOnPages: verb(placeAssetOnPages),
    } satisfies Partial<StampCapability>,
  };
}
