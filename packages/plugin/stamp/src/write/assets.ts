/**
 * Asset writes: every asset is a page of its library's PDF — a single-page
 * PDF is inserted, a raster becomes a page with the image flattened into it.
 * Removal deletes the page; relabel renames the registry entry. All through
 * the per-library mutation queue.
 */
import {
  EngineError,
  EngineErrorCode,
  resolveBinarySource,
  sniffBinaryMetadata,
} from '@embedpdf/engine-core/runtime';
import type { AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';

import type { AddAssetInput, StampAsset, StampAssetPreview, StampCapability } from '../contract';
import {
  assetIdFor,
  customStampName,
  stampKey,
  stampPieceInfo,
  STAMP_PIECEINFO_APP,
} from '../convention';
import type { StampContext, StampServices } from '../services';
import { notFound } from '../services/errors';
import type { StampLibraryWrites } from './libraries';
import type { StampMarks } from './marks';

export function createAssetWrites(
  ctx: StampContext,
  { events, binaries, assetEngine }: Pick<StampServices, 'events' | 'binaries' | 'assetEngine'>,
  { resolveAssetSource }: StampMarks,
  { createLibrary }: Pick<StampLibraryWrites, 'createLibrary'>,
) {
  const { libraryChanged, assetCreated, assetUpdated, assetDeleted } = events;
  const { binaries: assetBinaries, libraryBinaries, ghostRenders, mutateLibrary } = binaries;
  const { openAssetDocument, renderThumbnail, requireCanonicalServices } = assetEngine;

  const addAsset = async (input: AddAssetInput): Promise<string> => {
    if (input.libraryId && !ctx.getState().libraries[input.libraryId]) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `[stamp] unknown library '${input.libraryId}'`,
      );
    }
    const resolved = await resolveAssetSource(input);
    const meta = sniffBinaryMetadata(resolved.bytes);
    if (!meta) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        '[stamp] asset source must be PNG, JPEG, or single-page PDF bytes',
      );
    }
    const isPdf = meta.mimeType === 'application/pdf';
    const name = input.name ?? customStampName();
    const label = input.label ?? name;
    if (name.length === 0 || name.includes('=')) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `[stamp] invalid stamp identifier '${name}': must be non-empty and contain no '='`,
      );
    }
    const rasterSize =
      input.size ?? ('width' in meta ? { width: meta.width, height: meta.height } : null);
    if (!isPdf && (!rasterSize || rasterSize.width <= 0 || rasterSize.height <= 0)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        '[stamp] a raster asset needs a positive `size` (its page size in points)',
      );
    }

    let suppliedPreview: StampAssetPreview | null = null;
    if (input.preview) {
      const preview = await resolveBinarySource(input.preview);
      suppliedPreview = {
        bytes: new Uint8Array(preview.bytes),
        mimeType: preview.mimeType ?? 'image/png',
      };
    }

    // No library named → one of its own, named after the label.
    const libraryId = input.libraryId ?? (await createLibrary(label));

    return mutateLibrary(libraryId, async () => {
      const liveLibrary = ctx.getState().libraries[libraryId];
      if (!liveLibrary) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `[stamp] library '${libraryId}' no longer exists`,
        );
      }
      const assetId = assetIdFor(liveLibrary.id, name);
      if (ctx.getState().assets[assetId]) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `[stamp] library '${liveLibrary.name}' already has a stamp named '${name}'`,
        );
      }
      const canonicalBytes = libraryBinaries.get(liveLibrary.id);
      if (!canonicalBytes) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `[stamp] canonical bytes are missing for library '${liveLibrary.id}'`,
        );
      }

      const doc = await openAssetDocument(canonicalBytes);
      let appended:
        | {
            asset: StampAsset;
            bytes: Uint8Array;
            preview: StampAssetPreview;
            canonical: Uint8Array;
          }
        | undefined;
      try {
        requireCanonicalServices(doc);
        let page: PageRef;
        if (isPdf) {
          const result = await doc.pages.insert(new Uint8Array(resolved.bytes));
          if (result.insertedPages.length !== 1) {
            throw new EngineError(
              EngineErrorCode.InvalidArg,
              '[stamp] a library asset must be a single-page PDF',
            );
          }
          page = result.insertedPages[0];
        } else {
          // Raster → page: a blank page the image's size, the image placed
          // to fill it, flattened into content. From here on it is a page
          // like any other — exportable, persistable, Acrobat-readable.
          if (!doc.pages.flatten) {
            throw new EngineError(
              EngineErrorCode.NotImplemented,
              '[stamp] raster assets need an asset engine with pages.flatten',
            );
          }
          const blank = await doc.pages.insertBlank({ size: rasterSize! });
          page = blank.insertedPages[0];
          await doc.page(page).annotations.create({
            subtype: 'stamp',
            rect: { left: 0, bottom: 0, right: rasterSize!.width, top: rasterSize!.height },
            source: new Uint8Array(resolved.bytes),
            fit: 'fill',
          });
          const flattened = await doc.pages.flatten([page], 'display');
          if (flattened.results.some(({ status }) => status !== 'applied')) {
            throw new EngineError(
              EngineErrorCode.Unknown,
              '[stamp] flattening the raster into its page failed',
            );
          }
        }
        const layout = (await doc.pages.list()).pages.find(
          (candidate) => candidate.ref.pageObjectNumber === page.pageObjectNumber,
        );
        const handle = doc.page(page);
        if (!layout || !handle.pieceInfo) {
          throw new EngineError(
            EngineErrorCode.NotImplemented,
            '[stamp] canonical PDF libraries need page layout and pieceInfo support',
          );
        }
        // Insert copies the page only — register it in the same mutation.
        await doc.pages.setName!({ name: stampKey(name, label), page });
        const asset: StampAsset = {
          id: assetId,
          libraryId: liveLibrary.id,
          kind: input.kind ?? 'stamp',
          name,
          label,
          size: { width: layout.size.width, height: layout.size.height },
          page,
          ...(input.subject !== undefined ? { subject: input.subject } : {}),
          ...(input.categories !== undefined ? { categories: input.categories } : {}),
        };
        await handle.pieceInfo.update(
          STAMP_PIECEINFO_APP,
          stampPieceInfo(asset.kind, { subject: asset.subject, categories: asset.categories }),
        );
        const bytes = await doc.pages.extract([page]);
        const preview = suppliedPreview ?? (await renderThumbnail(handle));
        appended = { asset, bytes, preview, canonical: await doc.download() };
      } finally {
        await doc.close();
      }

      libraryBinaries.set(liveLibrary.id, appended.canonical);
      assetBinaries.set(appended.asset.id, { bytes: appended.bytes, preview: appended.preview });
      ctx.dispatch({ type: 'ASSET_ADDED', asset: appended.asset });
      libraryChanged.emit({ libraryId: liveLibrary.id, reason: 'asset-added' });
      assetCreated.emit({
        assetId: appended.asset.id,
        libraryId: liveLibrary.id,
        asset: appended.asset,
      });
      return appended.asset.id;
    });
  };

  const addAssetFromAnnotations = async (
    documentId: string,
    page: PageRef,
    refs: AnnotationRef[],
    input: Omit<AddAssetInput, 'source' | 'size'>,
  ): Promise<string> => {
    const doc = ctx.documentHandle(documentId);
    if (!doc) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `[stamp] target document '${documentId}' is not open`,
      );
    }
    const handle = doc.page(page);
    if (!handle.annotations.exportAppearance) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        "[stamp] this document's engine cannot export annotation appearances",
      );
    }
    // The engine flattens the selection into a fresh single-page PDF —
    // the same placement whole-page flatten uses, aimed at a new page.
    const source = await handle.annotations.exportAppearance(refs);
    return addAsset({ ...input, source });
  };

  const removeAsset = async (id: string): Promise<void> => {
    const initialAsset = ctx.getState().assets[id];
    if (!initialAsset) return;
    return mutateLibrary(initialAsset.libraryId, async () => {
      const asset = ctx.getState().assets[id];
      if (!asset) return;
      const library = ctx.getState().libraries[asset.libraryId];
      if (!library) return;
      const canonicalBytes = libraryBinaries.get(library.id);
      if (!canonicalBytes) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `[stamp] canonical bytes are missing for library '${library.id}'`,
        );
      }
      // The page goes; the engine drops its registry entry inside the
      // delete. The unregistered blank keeps the file valid when this was
      // the last stamp — a library with no stamps is still a library.
      const doc = await openAssetDocument(canonicalBytes);
      let rewritten: Uint8Array | undefined;
      try {
        await doc.pages.delete([asset.page]);
        rewritten = await doc.download();
      } finally {
        await doc.close();
      }
      libraryBinaries.set(library.id, rewritten);
      assetBinaries.delete(id);
      ghostRenders.delete(id);
      ctx.dispatch({ type: 'ASSET_REMOVED', assetId: id });
      libraryChanged.emit({ libraryId: library.id, reason: 'asset-removed' });
      assetDeleted.emit({ assetId: id, libraryId: library.id, asset: null });
    });
  };

  const updateAsset = async (
    id: string,
    patch: { label?: string; subject?: string | null; categories?: string[] },
  ): Promise<void> => {
    const initial = ctx.getState().assets[id];
    if (!initial) throw new EngineError(EngineErrorCode.NotFound, `[stamp] unknown asset '${id}'`);
    return mutateLibrary(initial.libraryId, async () => {
      const asset = ctx.getState().assets[id];
      const library = asset ? ctx.getState().libraries[asset.libraryId] : undefined;
      if (!asset || !library) {
        throw new EngineError(EngineErrorCode.NotFound, `[stamp] unknown asset '${id}'`);
      }
      const next: StampAsset = {
        ...asset,
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.categories !== undefined ? { categories: patch.categories } : {}),
      };
      if (patch.subject === null) delete next.subject;
      else if (patch.subject !== undefined) next.subject = patch.subject;

      const canonicalBytes = libraryBinaries.get(library.id);
      if (!canonicalBytes) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `[stamp] canonical bytes are missing for library '${library.id}'`,
        );
      }
      const doc = await openAssetDocument(canonicalBytes);
      let rewritten: Uint8Array | undefined;
      try {
        requireCanonicalServices(doc);
        if (next.label !== asset.label) {
          // A relabel is a registry rename — one job, the identifier untouched.
          await doc.pages.setName!({
            name: stampKey(asset.name, next.label),
            page: asset.page,
            replace: stampKey(asset.name, asset.label),
          });
        }
        const page = doc.page(asset.page);
        await page.pieceInfo?.update(
          STAMP_PIECEINFO_APP,
          stampPieceInfo(next.kind, { subject: next.subject, categories: next.categories }),
        );
        rewritten = await doc.download();
      } finally {
        await doc.close();
      }
      libraryBinaries.set(library.id, rewritten);
      ctx.dispatch({ type: 'ASSET_UPDATED', asset: next });
      libraryChanged.emit({ libraryId: library.id, reason: 'asset-updated' });
      assetUpdated.emit({ assetId: next.id, libraryId: library.id, asset: next });
    });
  };

  return {
    api: {
      createAsset: addAsset,
      createAssetFromAnnotations: (documentId, page, refs, input) =>
        addAssetFromAnnotations(documentId, page, [...refs], input),
      updateAsset,
      deleteAsset: removeAsset,
      moveAsset: async (id, to) => {
        const asset = ctx.getState().assets[id];
        const bin = assetBinaries.get(id);
        if (!asset || !bin) throw notFound('asset', id);
        if (to.libraryId === asset.libraryId) return id;
        const copy = await addAsset({
          libraryId: to.libraryId,
          source: new Uint8Array(bin.bytes),
          kind: asset.kind,
          label: asset.label,
          ...(asset.subject !== undefined ? { subject: asset.subject } : {}),
          ...(asset.categories ? { categories: [...asset.categories] } : {}),
          ...(bin.preview ? { preview: bin.preview.bytes } : {}),
        });
        await removeAsset(id);
        return copy;
      },
      duplicateAsset: async (id, options) => {
        const asset = ctx.getState().assets[id];
        const bin = assetBinaries.get(id);
        if (!asset || !bin) throw notFound('asset', id);
        return addAsset({
          libraryId: asset.libraryId,
          source: new Uint8Array(bin.bytes),
          kind: asset.kind,
          label: options?.label ?? `${asset.label} copy`,
          ...(asset.subject !== undefined ? { subject: asset.subject } : {}),
          ...(asset.categories ? { categories: [...asset.categories] } : {}),
          ...(bin.preview ? { preview: bin.preview.bytes } : {}),
        });
      },
    } satisfies Partial<StampCapability>,
  };
}
