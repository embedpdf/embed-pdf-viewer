/**
 * Library writes. A library IS a PDF: its `/Title` is the name, its
 * `/Names /Pages` registry the assets, its pages the artwork, PieceInfo only
 * what has no standard home. Every whole-PDF rewrite rides the per-library
 * mutation queue.
 */
import {
  EngineError,
  EngineErrorCode,
  resolveBinarySource,
  sniffBinaryMetadata,
} from '@embedpdf/engine-core/runtime';
import type { BinarySource, PageRef, PieceInfoEntry } from '@embedpdf/engine-core/runtime';

import { blankLibraryPdf } from '../blank-library';
import type {
  ImportLibraryOptions,
  StampAsset,
  StampAssetKind,
  StampAssetPreview,
  StampCapability,
  StampLibrary,
} from '../contract';
import {
  assetIdFor,
  DEFAULT_LIBRARY_KIND,
  libraryKindFromPdfName,
  parseStampKey,
  stampKey,
  stampLibraryPieceInfo,
  stampPieceInfo,
  STAMP_LIBRARY_PIECEINFO_APP,
  STAMP_PIECEINFO_APP,
} from '../convention';
import type { StampContext, StampServices } from '../services';
import { uid } from '../services/asset-engine';

const entryString = (entries: Record<string, PieceInfoEntry>, key: string): string | undefined => {
  const entry = entries[key];
  return entry?.type === 'string' && entry.value.length > 0 ? entry.value : undefined;
};

const entryName = (entries: Record<string, PieceInfoEntry>, key: string): string | undefined => {
  const entry = entries[key];
  return entry?.type === 'name' && entry.value.length > 0 ? entry.value : undefined;
};

const entryStringArray = (
  entries: Record<string, PieceInfoEntry>,
  key: string,
): string[] | undefined => {
  const entry = entries[key];
  return entry?.type === 'string-array' ? [...entry.value] : undefined;
};

const kindFromPdfName = (name: string | undefined): StampAssetKind | undefined => {
  switch (name?.toLowerCase()) {
    case 'stamp':
      return 'stamp';
    case 'signature':
      return 'signature';
    case 'initials':
      return 'initials';
    default:
      return undefined;
  }
};

const allocateId = (preferred: string | undefined, prefix: string, taken: Set<string>): string => {
  let id = preferred;
  if (!id || taken.has(id)) {
    do id = uid(prefix);
    while (taken.has(id));
  }
  taken.add(id);
  return id;
};

export function createLibraryWrites(
  ctx: StampContext,
  { events, binaries, assetEngine }: Pick<StampServices, 'events' | 'binaries' | 'assetEngine'>,
) {
  const { libraryChanged, libraryCreated, libraryUpdated, libraryDeleted, assetCreated } = events;
  const { binaries: assetBinaries, libraryBinaries, ghostRenders, mutateLibrary } = binaries;
  const { openAssetDocument, renderThumbnail, requireCanonicalServices } = assetEngine;

  const createLibrary = async (
    name: string,
    opts?: { id?: string; kind?: string; categories?: string[] },
  ): Promise<string> => {
    const kind = opts?.kind ?? DEFAULT_LIBRARY_KIND;
    const taken = new Set(Object.keys(ctx.getState().libraries));
    const id = allocateId(opts?.id, 'stamp-lib', taken);
    const doc = await openAssetDocument(blankLibraryPdf());
    let bytes: Uint8Array;
    try {
      requireCanonicalServices(doc);
      await doc.metadata.update({ title: name });
      await doc.pieceInfo!.update(
        STAMP_LIBRARY_PIECEINFO_APP,
        stampLibraryPieceInfo(id, { kind, categories: opts?.categories }),
      );
      bytes = await doc.download();
    } finally {
      await doc.close();
    }
    libraryBinaries.set(id, bytes);
    ctx.dispatch({
      type: 'LIBRARY_ADDED',
      library: {
        id,
        name,
        kind,
        assetIds: [],
        ...(opts?.categories ? { categories: opts.categories } : {}),
      },
    });
    libraryChanged.emit({ libraryId: id, reason: 'created' });
    libraryCreated.emit({ libraryId: id, library: ctx.getState().libraries[id] ?? null });
    return id;
  };

  const importLibraryPdf = async (
    source: BinarySource,
    opts?: ImportLibraryOptions,
  ): Promise<string> => {
    const resolved = await resolveBinarySource(source);
    const meta = sniffBinaryMetadata(resolved.bytes);
    if (meta?.mimeType !== 'application/pdf') {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        '[stamp] importLibraryPdf needs PDF bytes (use addAsset for a raster image)',
      );
    }
    const doc = await openAssetDocument(new Uint8Array(resolved.bytes));
    let imported:
      | {
          library: StampLibrary;
          canonicalBytes: Uint8Array;
          assets: Array<{
            asset: StampAsset;
            bytes: Uint8Array;
            preview: StampAssetPreview;
          }>;
        }
      | undefined;
    try {
      requireCanonicalServices(doc);
      const layout = await doc.pages.list();
      if (layout.pageCount === 0) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          '[stamp] a canonical stamp library PDF must contain at least one page',
        );
      }
      const byPon = new Map(layout.pages.map((page) => [page.ref.pageObjectNumber, page]));

      // ── library identity: /Title (Acrobat) → v1 PieceInfo → caller fallback ──
      const catalogEntries =
        (await doc.pieceInfo!.read(STAMP_LIBRARY_PIECEINFO_APP))?.entries ?? {};
      const state = ctx.getState();
      const takenLibraryIds = new Set(Object.keys(state.libraries));
      const libraryId = allocateId(entryString(catalogEntries, 'Id'), 'stamp-lib', takenLibraryIds);
      const docMeta = await doc.metadata.read();
      const libraryName =
        (docMeta.title && docMeta.title.length > 0 ? docMeta.title : undefined) ??
        entryString(catalogEntries, 'Name') ??
        opts?.name ??
        'Stamps';
      if (!docMeta.title) await doc.metadata.update({ title: libraryName });
      const libraryCategories = opts?.categories ?? entryStringArray(catalogEntries, 'Categories');
      const libraryLocale = entryString(catalogEntries, 'Locale');
      // What the file is for: the caller's word, else the file's, else a plain stamp library.
      const libraryKind =
        opts?.libraryKind ?? libraryKindFromPdfName(entryName(catalogEntries, 'Kind'));

      // ── the registry: /Names /Pages keys `identifier=label` → pages ──
      const registry = (layout.namedPages ?? []).filter(
        (entry): entry is typeof entry & { target: { kind: 'page' } } =>
          entry.target.kind === 'page',
      );
      const hidden = (layout.namedPages ?? []).filter((entry) => entry.target.kind !== 'page');
      if (hidden.length > 0) {
        globalThis.console?.warn(
          `[stamp] library '${libraryName}' carries ${hidden.length} hidden-template or dangling registration(s); they are not stamps and were ignored`,
        );
      }

      type Descriptor = { page: PageRef; index: number; name: string; label: string };
      let descriptors: Descriptor[];
      if (registry.length > 0) {
        const seen = new Set<string>();
        descriptors = registry.map((entry) => {
          const { name, label } = parseStampKey(entry.name);
          if (!name) {
            throw new EngineError(
              EngineErrorCode.InvalidArg,
              `[stamp] library '${libraryName}': empty stamp identifier in key '${entry.name}'`,
            );
          }
          if (seen.has(name)) {
            throw new EngineError(
              EngineErrorCode.InvalidArg,
              `[stamp] library '${libraryName}': duplicate stamp identifier '${name}'`,
            );
          }
          seen.add(name);
          const page = byPon.get(entry.target.page.pageObjectNumber)!;
          return { page: page.ref, index: page.index, name, label };
        });
        // Display order is PAGE order, never the tree's key-sorted order.
        descriptors.sort((a, b) => a.index - b.index);
      } else if (layout.namedPages === undefined) {
        throw new EngineError(
          EngineErrorCode.NotImplemented,
          '[stamp] the asset engine reports no named-page registry (an older engine); upgrade it to import libraries',
        );
      } else {
        // A plain PDF: every page is a stamp. Register it so the canonical
        // copy is Acrobat-readable on export. v1 PieceInfo keys are honoured
        // as a fallback for libraries written before the registry.
        descriptors = [];
        for (const page of layout.pages) {
          const v1 = (await doc.page(page.ref).pieceInfo?.read(STAMP_PIECEINFO_APP))?.entries;
          const name = (v1 && entryString(v1, 'Name')) ?? `Stamp${page.index + 1}`;
          const label = (v1 && entryString(v1, 'Subject')) ?? opts?.assetName?.(page.index) ?? name;
          descriptors.push({ page: page.ref, index: page.index, name, label });
        }
        for (const d of descriptors) {
          await doc.pages.setName!({ name: stampKey(d.name, d.label), page: d.page });
        }
      }

      await doc.pieceInfo!.update(
        STAMP_LIBRARY_PIECEINFO_APP,
        stampLibraryPieceInfo(libraryId, {
          kind: libraryKind,
          categories: libraryCategories,
          locale: libraryLocale,
        }),
      );

      const assets: NonNullable<typeof imported>['assets'] = [];
      for (const d of descriptors) {
        const handle = doc.page(d.page);
        if (!handle.pieceInfo) {
          throw new EngineError(
            EngineErrorCode.NotImplemented,
            '[stamp] canonical PDF libraries need page pieceInfo support',
          );
        }
        const entries = (await handle.pieceInfo.read(STAMP_PIECEINFO_APP))?.entries ?? {};
        const kind = opts?.kind ?? kindFromPdfName(entryName(entries, 'Kind')) ?? 'stamp';
        const subject = entryString(entries, 'SubjectOverride');
        const categories = entryStringArray(entries, 'Categories');
        const page = byPon.get(d.page.pageObjectNumber)!;
        const asset: StampAsset = {
          id: assetIdFor(libraryId, d.name),
          libraryId,
          kind,
          name: d.name,
          label: d.label,
          size: { width: page.size.width, height: page.size.height },
          page: d.page,
          ...(subject !== undefined ? { subject } : {}),
          ...(categories !== undefined ? { categories } : {}),
        };
        await handle.pieceInfo.update(
          STAMP_PIECEINFO_APP,
          stampPieceInfo(kind, { subject, categories }),
        );
        // One canonical page → one derived placement PDF plus a thumbnail.
        const bytes = await doc.pages.extract([d.page]);
        assets.push({ asset, bytes, preview: await renderThumbnail(handle) });
      }

      imported = {
        library: {
          id: libraryId,
          name: libraryName,
          kind: libraryKind,
          ...(libraryLocale ? { locale: libraryLocale } : {}),
          categories: libraryCategories,
          assetIds: [],
        },
        canonicalBytes: await doc.download(),
        assets,
      };
    } finally {
      await doc.close();
    }

    libraryBinaries.set(imported.library.id, imported.canonicalBytes);
    ctx.dispatch({ type: 'LIBRARY_ADDED', library: imported.library });
    for (const { asset, bytes, preview } of imported.assets) {
      assetBinaries.set(asset.id, { bytes, preview });
      ctx.dispatch({ type: 'ASSET_ADDED', asset });
    }
    libraryChanged.emit({ libraryId: imported.library.id, reason: 'imported' });
    libraryCreated.emit({ libraryId: imported.library.id, library: imported.library });
    for (const { asset } of imported.assets) {
      assetCreated.emit({ assetId: asset.id, libraryId: imported.library.id, asset });
    }
    return imported.library.id;
  };

  const dropLibrary = (id: string): void => {
    const library = ctx.getState().libraries[id];
    if (library) {
      for (const assetId of library.assetIds) {
        assetBinaries.delete(assetId);
        ghostRenders.delete(assetId);
      }
    }
    libraryBinaries.delete(id);
    ctx.dispatch({ type: 'LIBRARY_REMOVED', libraryId: id });
  };

  const removeLibrary = (id: string): Promise<void> =>
    mutateLibrary(id, async () => {
      const existed = ctx.getState().libraries[id] !== undefined;
      dropLibrary(id);
      if (existed) {
        libraryChanged.emit({ libraryId: id, reason: 'removed' });
        libraryDeleted.emit({ libraryId: id, library: null });
      }
    });

  const updateLibrary = async (
    id: string,
    patch: { name?: string; categories?: string[] },
  ): Promise<void> => {
    if (!ctx.getState().libraries[id]) {
      throw new EngineError(EngineErrorCode.NotFound, `[stamp] unknown library '${id}'`);
    }
    return mutateLibrary(id, async () => {
      const library = ctx.getState().libraries[id];
      if (!library) {
        throw new EngineError(EngineErrorCode.NotFound, `[stamp] unknown library '${id}'`);
      }
      const canonicalBytes = libraryBinaries.get(id);
      if (!canonicalBytes) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `[stamp] canonical bytes are missing for library '${id}'`,
        );
      }
      const next: StampLibrary = {
        ...library,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.categories !== undefined ? { categories: patch.categories } : {}),
      };
      const doc = await openAssetDocument(canonicalBytes);
      let rewritten: Uint8Array | undefined;
      try {
        requireCanonicalServices(doc);
        // The name is the PDF's /Title; kind, id, categories, locale ride PieceInfo.
        if (next.name !== library.name) await doc.metadata.update({ title: next.name });
        await doc.pieceInfo!.update(
          STAMP_LIBRARY_PIECEINFO_APP,
          stampLibraryPieceInfo(id, {
            kind: next.kind,
            categories: next.categories,
            locale: next.locale,
          }),
        );
        rewritten = await doc.download();
      } finally {
        await doc.close();
      }
      libraryBinaries.set(id, rewritten);
      ctx.dispatch({ type: 'LIBRARY_UPDATED', library: next });
      libraryChanged.emit({ libraryId: id, reason: 'updated' });
      libraryUpdated.emit({ libraryId: id, library: next });
    });
  };

  return {
    createLibrary,
    api: {
      createLibrary,
      updateLibrary,
      importLibrary: importLibraryPdf,
      deleteLibrary: removeLibrary,
    } satisfies Partial<StampCapability>,
  };
}
export type StampLibraryWrites = ReturnType<typeof createLibraryWrites>;
