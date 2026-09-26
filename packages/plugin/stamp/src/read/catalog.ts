/** Reads over the state and the binaries resource: libraries, assets,
 *  previews, the library's PDF, and the two twins. */
import { DocumentsToken } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';

import type {
  StampAsset,
  StampAssetFilter,
  StampCapability,
  StampLibrary,
  StampLibraryFilter,
} from '../contract';
import type { StampContext, StampServices } from '../services';
import { notFound, verb } from '../services/errors';

export function createCatalog(
  ctx: StampContext,
  { binaries, assetEngine, ghosts }: Pick<StampServices, 'binaries' | 'assetEngine' | 'ghosts'>,
) {
  const { binaries: assetBinaries, libraryBinaries } = binaries;
  const { ghostProvider } = ghosts;

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
  const canPlace = (documentId?: string): boolean => {
    const id = documentId ?? ctx.get(DocumentsToken).getActiveId();
    if (!id) return false;
    return ctx.tryForDocument(AnnotationToken, id)?.canCreate() ?? false;
  };

  return {
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
      getLibrary: (id) => ctx.state.get().libraries[id] ?? null,
      listAssets,
      getAsset: (id) => ctx.state.get().assets[id] ?? null,
      getAssetPreview: (id) => assetBinaries.get(id)?.preview ?? null,
      renderAssetPreview: verb(async (id: string, { width }: { width: number }) => {
        const binary = assetBinaries.get(id);
        if (!binary) throw notFound('asset', id);
        const preview = await ghostProvider(binary.bytes, binary.preview, id)(width);
        return preview ? { bytes: preview.bytes, mimeType: preview.mimeType ?? 'image/png' } : null;
      }),
      readAssetBytes: (id) => {
        const bytes = assetBinaries.get(id)?.bytes;
        return bytes ? new Uint8Array(bytes) : null;
      },
      exportLibrary: async (id) => {
        const bytes = libraryBinaries.get(id);
        if (!bytes) throw notFound('library', id);
        return new Uint8Array(bytes);
      },
      canPlace,
      canImport: assetEngine.canImport,
    } satisfies Partial<StampCapability>,
  };
}
