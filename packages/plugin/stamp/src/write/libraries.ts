/**
 * Library writes. A library is a PDF: its `/Title` is the name, its
 * `/Names /Pages` registry the assets, its pages the artwork, PieceInfo only
 * what has no standard home. Every whole-PDF rewrite rides the per-library
 * mutation queue.
 */
import { resolveBinarySource, sniffBinaryMetadata } from '@embedpdf/engine-core/runtime';
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
import { addAsset, addLibrary, removeLibrary, setLibrary } from '../model';
import type { StampContext, StampServices } from '../services';
import { uid } from '../services/asset-engine';
import { notFound, stampError, verb } from '../services/errors';

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
    options?: { id?: string; kind?: string; categories?: string[] },
  ): Promise<string> => {
    const kind = options?.kind ?? DEFAULT_LIBRARY_KIND;
    const taken = new Set(Object.keys(ctx.state.get().libraries));
    const id = allocateId(options?.id, 'stamp-lib', taken);
    const doc = await openAssetDocument(blankLibraryPdf());
    let bytes: Uint8Array;
    try {
      requireCanonicalServices(doc);
      await doc.metadata.update({ title: name });
      await doc.pieceInfo!.update(
        STAMP_LIBRARY_PIECEINFO_APP,
        stampLibraryPieceInfo(id, { kind, categories: options?.categories }),
      );
      bytes = await doc.download();
    } finally {
      await doc.close();
    }
    libraryBinaries.set(id, bytes);
    ctx.state.update(addLibrary, {
      id,
      name,
      kind,
      assetIds: [],
      ...(options?.categories ? { categories: options.categories } : {}),
    });
    libraryChanged.emit({ libraryId: id, reason: 'created' });
    libraryCreated.emit({ libraryId: id, library: ctx.state.get().libraries[id] ?? null });
    return id;
  };

  const importLibrary = async (
    source: BinarySource,
    options?: ImportLibraryOptions,
  ): Promise<string> => {
    const resolved = await resolveBinarySource(source);
    const meta = sniffBinaryMetadata(resolved.bytes);
    if (meta?.mimeType !== 'application/pdf') {
      throw stampError(
        'invalid-input',
        'importLibrary needs PDF bytes (use createAsset for a raster image)',
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
        throw stampError(
          'invalid-input',
          'a canonical stamp library PDF must contain at least one page',
        );
      }
      const pagesByObjectNumber = new Map(
        layout.pages.map((page) => [page.ref.pageObjectNumber, page]),
      );

      // Library identity: /Title (Acrobat), then format version 1 PieceInfo, then the caller's fallback.
      const catalogEntries =
        (await doc.pieceInfo!.read(STAMP_LIBRARY_PIECEINFO_APP))?.entries ?? {};
      const takenLibraryIds = new Set(Object.keys(ctx.state.get().libraries));
      const libraryId = allocateId(entryString(catalogEntries, 'Id'), 'stamp-lib', takenLibraryIds);
      const docMeta = await doc.metadata.read();
      const libraryName =
        (docMeta.title && docMeta.title.length > 0 ? docMeta.title : undefined) ??
        entryString(catalogEntries, 'Name') ??
        options?.name ??
        'Stamps';
      if (!docMeta.title) await doc.metadata.update({ title: libraryName });
      const libraryCategories =
        options?.categories ?? entryStringArray(catalogEntries, 'Categories');
      const libraryLocale = entryString(catalogEntries, 'Locale');
      // What the file is for: the caller's word, else the file's, else a plain stamp library.
      const libraryKind =
        options?.libraryKind ?? libraryKindFromPdfName(entryName(catalogEntries, 'Kind'));

      // The registry: /Names /Pages keys `identifier=label` naming pages.
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
            throw stampError(
              'invalid-input',
              `library '${libraryName}': empty stamp identifier in key '${entry.name}'`,
            );
          }
          if (seen.has(name)) {
            throw stampError(
              'invalid-input',
              `library '${libraryName}': duplicate stamp identifier '${name}'`,
            );
          }
          seen.add(name);
          const page = pagesByObjectNumber.get(entry.target.page.pageObjectNumber)!;
          return { page: page.ref, index: page.index, name, label };
        });
        // Display order is page order, never the tree's key-sorted order.
        descriptors.sort((left, right) => left.index - right.index);
      } else if (layout.namedPages === undefined) {
        throw stampError(
          'unsupported',
          'the asset engine reports no named-page registry; an engine with named pages is needed to import libraries',
        );
      } else {
        // A plain PDF: every page is a stamp. Register it so the canonical
        // copy is Acrobat-readable on export. Format version 1 PieceInfo keys
        // (`Name`, `Subject`) name the stamps of a library without a registry.
        descriptors = [];
        for (const page of layout.pages) {
          const version1Entries = (await doc.page(page.ref).pieceInfo?.read(STAMP_PIECEINFO_APP))
            ?.entries;
          const name =
            (version1Entries && entryString(version1Entries, 'Name')) ?? `Stamp${page.index + 1}`;
          const label =
            (version1Entries && entryString(version1Entries, 'Subject')) ??
            options?.assetName?.(page.index) ??
            name;
          descriptors.push({ page: page.ref, index: page.index, name, label });
        }
        for (const descriptor of descriptors) {
          await doc.pages.setName!({
            name: stampKey(descriptor.name, descriptor.label),
            page: descriptor.page,
          });
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
      for (const descriptor of descriptors) {
        const handle = doc.page(descriptor.page);
        if (!handle.pieceInfo) {
          throw stampError('unsupported', 'canonical PDF libraries need page pieceInfo support');
        }
        const entries = (await handle.pieceInfo.read(STAMP_PIECEINFO_APP))?.entries ?? {};
        const kind = options?.kind ?? kindFromPdfName(entryName(entries, 'Kind')) ?? 'stamp';
        const subject = entryString(entries, 'SubjectOverride');
        const categories = entryStringArray(entries, 'Categories');
        const page = pagesByObjectNumber.get(descriptor.page.pageObjectNumber)!;
        const asset: StampAsset = {
          id: assetIdFor(libraryId, descriptor.name),
          libraryId,
          kind,
          name: descriptor.name,
          label: descriptor.label,
          size: { width: page.size.width, height: page.size.height },
          page: descriptor.page,
          ...(subject !== undefined ? { subject } : {}),
          ...(categories !== undefined ? { categories } : {}),
        };
        await handle.pieceInfo.update(
          STAMP_PIECEINFO_APP,
          stampPieceInfo(kind, { subject, categories }),
        );
        // One canonical page → one derived placement PDF plus a thumbnail.
        const bytes = await doc.pages.extract([descriptor.page]);
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
    ctx.state.update(addLibrary, imported.library);
    for (const { asset, bytes, preview } of imported.assets) {
      assetBinaries.set(asset.id, { bytes, preview });
      ctx.state.update(addAsset, asset);
    }
    libraryChanged.emit({ libraryId: imported.library.id, reason: 'imported' });
    libraryCreated.emit({ libraryId: imported.library.id, library: imported.library });
    for (const { asset } of imported.assets) {
      assetCreated.emit({ assetId: asset.id, libraryId: imported.library.id, asset });
    }
    return imported.library.id;
  };

  const dropLibrary = (id: string): void => {
    const library = ctx.state.get().libraries[id];
    if (library) {
      for (const assetId of library.assetIds) {
        assetBinaries.delete(assetId);
        ghostRenders.delete(assetId);
      }
    }
    libraryBinaries.delete(id);
    ctx.state.update(removeLibrary, id);
  };

  const deleteLibrary = (id: string): Promise<void> =>
    mutateLibrary(id, async () => {
      const existed = ctx.state.get().libraries[id] !== undefined;
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
    if (!ctx.state.get().libraries[id]) throw notFound('library', id);
    return mutateLibrary(id, async () => {
      const library = ctx.state.get().libraries[id];
      if (!library) throw notFound('library', id);
      const canonicalBytes = libraryBinaries.get(id);
      if (!canonicalBytes) {
        throw stampError('operation-failed', `canonical bytes are missing for library '${id}'`);
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
      ctx.state.update(setLibrary, next);
      libraryChanged.emit({ libraryId: id, reason: 'updated' });
      libraryUpdated.emit({ libraryId: id, library: next });
    });
  };

  return {
    createLibrary,
    api: {
      createLibrary: verb(createLibrary),
      updateLibrary: verb(updateLibrary),
      importLibrary: verb(importLibrary),
      deleteLibrary: verb(deleteLibrary),
    } satisfies Partial<StampCapability>,
  };
}
export type StampLibraryWrites = ReturnType<typeof createLibraryWrites>;
