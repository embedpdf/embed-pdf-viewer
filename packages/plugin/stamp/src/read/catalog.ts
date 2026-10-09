/** Reads over the state and the binaries resource: libraries, assets,
 *  previews, the library's PDF, and the checks. */
import { DocumentsToken, type OperationOptions } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';

import type {
  StampAsset,
  StampAssetFilter,
  StampCapability,
  StampLibrary,
  StampLibraryFilter,
} from '../contract';
import type { StampContext, StampServices } from '../services';
import { notFound, throwIfCancelled, verb } from '../services/errors';

export function createCatalog(
  ctx: StampContext,
  {
    binaries,
    assetEngine,
    ghosts,
    targets,
  }: Pick<StampServices, 'binaries' | 'assetEngine' | 'ghosts' | 'targets'>,
) {
  const { binaries: assetBinaries, libraryBinaries } = binaries;
  const { ghostProvider } = ghosts;
  const { documentIdOf } = targets;

  const listAssets = (filter?: StampAssetFilter): readonly StampAsset[] => {
    const state = ctx.state.get();
    const libraryIds = filter?.libraryId ? [filter.libraryId] : state.libraryOrder;
    return libraryIds
      .flatMap((libraryId) =>
        (state.libraries[libraryId]?.assetIds ?? []).map((id) => state.assets[id]),
      )
      .filter(
        (asset): asset is StampAsset =>
          asset != null &&
          (!filter?.kind || asset.kind === filter.kind) &&
          (!filter?.category || (asset.categories ?? []).includes(filter.category)),
      );
  };

  /** Placing is annotation work: the document's annotation plugin answers. */
  const canPlace = (documentId?: string): boolean => {
    const id = documentIdOf(documentId);
    if (!id) return false;
    return ctx.tryForDocument(AnnotationToken, id)?.canCreate() ?? false;
  };

  /** A stamp made from annotations copies them out of the document, as a download does. */
  const canCreateFromAnnotations = (documentId?: string): boolean => {
    const id = documentIdOf(documentId);
    return id !== null && ctx.get(DocumentsToken).canDownload(id);
  };

  return {
    canPlace,
    canCreateFromAnnotations,
    api: {
      listLibraries: (filter?: StampLibraryFilter) => {
        const state = ctx.state.get();
        const kinds =
          filter?.kind === undefined
            ? null
            : new Set(typeof filter.kind === 'string' ? [filter.kind] : filter.kind);
        return state.libraryOrder
          .map((id) => state.libraries[id])
          .filter(
            (library): library is StampLibrary =>
              library != null && (kinds === null || kinds.has(library.kind)),
          );
      },
      getLibrary: (libraryId) => ctx.state.get().libraries[libraryId] ?? null,
      listAssets,
      getAsset: (assetId) => ctx.state.get().assets[assetId] ?? null,
      getAssetPreview: (assetId) => assetBinaries.get(assetId)?.preview ?? null,
      renderAssetPreview: verb(
        async (assetId: string, { width, signal }: { width: number } & OperationOptions) => {
          throwIfCancelled(signal);
          const binary = assetBinaries.get(assetId);
          if (!binary) throw notFound('asset', assetId);
          const preview = await ctx.cancellable(
            signal,
            ghostProvider(binary.bytes, binary.preview, assetId)(width),
          );
          return preview
            ? { bytes: preview.bytes, mimeType: preview.mimeType ?? 'image/png' }
            : null;
        },
      ),
      readAssetBytes: (assetId) => {
        const bytes = assetBinaries.get(assetId)?.bytes;
        return bytes ? new Uint8Array(bytes) : null;
      },
      exportLibrary: async (libraryId, options) => {
        throwIfCancelled(options?.signal);
        const bytes = libraryBinaries.get(libraryId);
        if (!bytes) throw notFound('library', libraryId);
        return new Uint8Array(bytes);
      },
      canPlace,
      canCreateFromAnnotations,
      canImport: assetEngine.canImport,
    } satisfies Partial<StampCapability>,
  };
}
export type StampCatalog = ReturnType<typeof createCatalog>;
