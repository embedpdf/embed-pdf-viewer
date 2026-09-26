/** Reads over the store and the binary sidecar: libraries, assets, previews,
 *  the library's PDF, and the two twins. */
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';

import type {
  StampAsset,
  StampAssetFilter,
  StampCapability,
  StampLibrary,
  StampLibraryFilter,
} from '../contract';
import type { StampContext, StampServices } from '../services';
import { notFound } from '../services/errors';

export function createCatalog(
  ctx: StampContext,
  { binaries, assetEngine, ghosts }: Pick<StampServices, 'binaries' | 'assetEngine' | 'ghosts'>,
) {
  const { binaries: assetBinaries, libraryBinaries } = binaries;
  const { ghostProvider } = ghosts;

  const listAssets = (filter?: StampAssetFilter): readonly StampAsset[] => {
    const s = ctx.getState();
    const scope = filter?.libraryId ? [filter.libraryId] : s.libraryOrder;
    return scope
      .flatMap((lid) => (s.libraries[lid]?.assetIds ?? []).map((id) => s.assets[id]))
      .filter(
        (a): a is StampAsset =>
          a != null &&
          (!filter?.kind || a.kind === filter.kind) &&
          (!filter?.category || (a.categories ?? []).includes(filter.category)),
      );
  };
  const canPlace = (documentId?: string): boolean => {
    const id = documentId ?? ctx.core().activeId;
    if (!id) return false;
    return ctx.tryForDocument(AnnotationToken, id)?.canCreate() ?? false;
  };

  return {
    api: {
      listLibraries: (filter?: StampLibraryFilter) => {
        const s = ctx.getState();
        const kinds =
          filter?.kind === undefined
            ? null
            : new Set(typeof filter.kind === 'string' ? [filter.kind] : filter.kind);
        return s.libraryOrder
          .map((id) => s.libraries[id])
          .filter((l): l is StampLibrary => l != null && (kinds === null || kinds.has(l.kind)));
      },
      getLibrary: (id) => ctx.getState().libraries[id] ?? null,
      listAssets,
      getAsset: (id) => ctx.getState().assets[id] ?? null,
      getAssetPreview: (id) => assetBinaries.get(id)?.preview ?? null,
      renderAssetPreview: (id, { width }) => {
        const bin = assetBinaries.get(id);
        if (!bin) return Promise.reject(notFound('asset', id));
        return ghostProvider(
          bin.bytes,
          bin.preview,
          id,
        )(width).then((preview) =>
          preview ? { bytes: preview.bytes, mimeType: preview.mimeType ?? 'image/png' } : null,
        );
      },
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
