import {
  EngineError,
  EngineErrorCode,
  resolveBinarySource,
  sniffBinaryMetadata,
  type BinarySource,
  type AnnotationRef,
  type DocumentHandle,
  type Engine,
  type PageImageHandle,
  type PageRef,
  type PieceInfoEntry,
} from '@embedpdf/engine-core/runtime';
import {
  createEventHook,
  PluginError,
  toPluginError,
  toPluginErrorInfo,
  type PluginContext,
} from '@embedpdf/core';
import { javaScriptProgramFromActionTree } from '@embedpdf/core-acrojs';
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import {
  AnnotationToken,
  type StampPlacement,
  type StampPreviewProvider,
} from '@embedpdf/plugin-annotation/contract';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { createFormScriptingController } from '@embedpdf/plugin-form/scripting';

import { blankLibraryPdf } from './blank-library';
import {
  assetIdFor,
  customStampName,
  DEFAULT_LIBRARY_KIND,
  libraryKindFromPdfName,
  parseStampKey,
  stampKey,
  stampLibraryPieceInfo,
  stampPieceInfo,
  STAMP_LIBRARY_PIECEINFO_APP,
  STAMP_PIECEINFO_APP,
} from './convention';
import type {
  AddAssetInput,
  ImportLibraryOptions,
  MarkSource,
  StampAction,
  StampAsset,
  StampAssetPreview,
  StampCapability,
  StampConfig,
  StampLibrary,
  StampLibraryChange,
  StampLibraryFilter,
  StampAssetFilter,
  StampArmChangedEvent,
  StampAssetEvent,
  StampLibraryEvent,
  StampAssetKind,
  StampState,
} from './types';

const DEFAULT_PREVIEW_WIDTH = 256;

/** `#rrggbb` → the engine's sRGB triplet. */
const hexColor = (hex: string): { r: number; g: number; b: number } => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m)
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `[stamp] mark color must be #rrggbb, got '${hex}'`,
    );
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
};

/** An exact ArrayBuffer over a view (the engine's binary idiom). */
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
};

/** The rect an ink mark occupies, padded by its stroke. */
const inkBounds = (
  strokes: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  strokeWidth: number,
): { left: number; bottom: number; right: number; top: number } => {
  let left = Infinity;
  let bottom = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  for (const stroke of strokes) {
    for (const { x, y } of stroke) {
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < bottom) bottom = y;
      if (y > top) top = y;
    }
  }
  if (!Number.isFinite(left)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      '[stamp] an ink mark needs at least one point',
    );
  }
  const pad = strokeWidth;
  return { left: left - pad, bottom: bottom - pad, right: right + pad, top: top + pad };
};

/** A generous box for typed text; the export crops to the glyphs. */
const textBounds = (
  text: string,
  fontSize: number,
): { left: number; bottom: number; right: number; top: number } => ({
  left: 0,
  bottom: 0,
  right: Math.max(1, text.length) * fontSize * 0.75 + fontSize,
  top: fontSize * 1.6,
});

/** Session-unique ids. Assets are session-scoped for now (no persistence),
 *  so a timestamp + counter is enough — durable ids come with the store port. */
let seq = 0;
const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

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

export function createStampCapability(
  ctx: PluginContext<StampState, StampAction>,
  config: StampConfig = {},
): StampCapability {
  /** Binary sidecar of the serializable store: asset bytes + cached preview,
   *  keyed by asset id. The reducer never sees these (kernel rule 1). */
  const binaries = new Map<string, { bytes: Uint8Array; preview: StampAssetPreview | null }>();
  /** The durable source of truth for a canonical library. Asset PDFs above
   *  are derived page extractions; this map owns the rewritten whole PDF. */
  const libraryBinaries = new Map<string, Uint8Array>();
  /** Whole-PDF rewrites must be serialized per library or two concurrent
   *  appends could both start from the same bytes and lose one page. */
  const libraryMutationTails = new Map<string, Promise<void>>();

  const mutateLibrary = <T>(libraryId: string, mutation: () => Promise<T>): Promise<T> => {
    const previous = libraryMutationTails.get(libraryId) ?? Promise.resolve();
    const result = previous.then(mutation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    libraryMutationTails.set(libraryId, tail);
    return result.finally(() => {
      if (libraryMutationTails.get(libraryId) === tail) libraryMutationTails.delete(libraryId);
    });
  };

  // The ASSET ENGINE port. A configured factory is called (and memoized) on
  // the first import, not at viewer start; a configured instance is used
  // as-is; nothing configured falls back to the kernel's engine — correct for
  // local deployments, and rejected with an actionable error by cloud engines
  // at the first `open({ kind: 'bytes' })`.
  let assetEngineRef: Engine | Promise<Engine> | null = null;
  const assetEngine = (): Engine | Promise<Engine> => {
    if (!assetEngineRef) {
      const cfg = config.assetEngine;
      assetEngineRef = !cfg ? ctx.engine : typeof cfg === 'function' ? cfg() : cfg;
    }
    return assetEngineRef;
  };

  const openAssetDocument = async (bytes: Uint8Array): Promise<DocumentHandle> => {
    try {
      return await (
        await assetEngine()
      ).open({ kind: 'bytes', id: uid('stamp-import'), bytes }, { scope: ['*'] });
    } catch (err) {
      // A cloud kernel engine rejects 'bytes' with InvalidArg — turn the
      // generic contract error into the configuration fix.
      if (!config.assetEngine && EngineError.is(err, EngineErrorCode.InvalidArg)) {
        importSupported = false;
        throw new EngineError(
          EngineErrorCode.NotImplemented,
          "[stamp] importing a library PDF needs an engine that can open local bytes, and this viewer's engine cannot (cloud). Pass stampPlugin({ assetEngine: () => import('@embedpdf/engine').then((m) => m.createLocalEngine()) }) — it loads lazily, on first import.",
        );
      }
      throw err;
    }
  };

  /** Import-time preview render → bytes. The asset engine is local by
   *  definition, so the image source is always inline bytes. */
  const imageToPreview = (image: PageImageHandle): StampAssetPreview => {
    if (image.source.kind !== 'bytes') {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        '[stamp] asset engine returned a URL-sourced render; asset engines must be local',
      );
    }
    return { bytes: image.source.bytes, mimeType: image.contentType };
  };

  const allocateId = (
    preferred: string | undefined,
    prefix: string,
    taken: Set<string>,
  ): string => {
    let id = preferred;
    if (!id || taken.has(id)) {
      do id = uid(prefix);
      while (taken.has(id));
    }
    taken.add(id);
    return id;
  };

  const reportListener = (error: unknown) =>
    globalThis.console?.error('[stamp] event listener failed:', error);
  const libraryChanged = createEventHook<StampLibraryChange>(reportListener);
  const libraryCreated = createEventHook<StampLibraryEvent>(reportListener);
  const libraryUpdated = createEventHook<StampLibraryEvent>(reportListener);
  const libraryDeleted = createEventHook<StampLibraryEvent>(reportListener);
  const assetCreated = createEventHook<StampAssetEvent>(reportListener);
  const assetUpdated = createEventHook<StampAssetEvent>(reportListener);
  const assetDeleted = createEventHook<StampAssetEvent>(reportListener);
  const armChanged = createEventHook<StampArmChangedEvent>(reportListener);
  ctx.cleanup(() => {
    for (const hook of [
      libraryChanged,
      libraryCreated,
      libraryUpdated,
      libraryDeleted,
      assetCreated,
      assetUpdated,
      assetDeleted,
      armChanged,
    ])
      hook.dispose();
  });
  /** Set once an import proves the engine cannot open local bytes (cloud). */
  let importSupported: boolean | null = null;

  /** Thumbnail render of one library page (the small picker image). */
  const renderThumbnail = async (
    handle: ReturnType<DocumentHandle['page']>,
  ): Promise<StampAssetPreview> =>
    imageToPreview(
      await handle.render.image({
        viewport: { kind: 'width', width: config.previewWidth ?? DEFAULT_PREVIEW_WIDTH },
        background: 'transparent',
        includeAnnotations: true,
        format: 'png',
      }),
    );

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

  const requireCanonicalServices = (doc: DocumentHandle): void => {
    if (!doc.pieceInfo) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        '[stamp] canonical PDF libraries need an asset engine with pieceInfo',
      );
    }
    if (!doc.pages.setName || !doc.pages.removeName) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        '[stamp] canonical PDF libraries need an asset engine with named pages (pages.setName)',
      );
    }
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
      binaries.set(asset.id, { bytes, preview });
      ctx.dispatch({ type: 'ASSET_ADDED', asset });
    }
    libraryChanged.emit({ libraryId: imported.library.id, reason: 'imported' });
    libraryCreated.emit({ libraryId: imported.library.id, library: imported.library });
    for (const { asset } of imported.assets) {
      assetCreated.emit({ assetId: asset.id, libraryId: imported.library.id, asset });
    }
    return imported.library.id;
  };

  /**
   * A drawn or typed mark rendered to a one-page PDF: the annotation is
   * authored on a scratch page and exported the way "stamp from selection"
   * exports — a fresh page the size of the mark, paths kept as paths, the
   * font subset-embedded. Self-contained and Acrobat-readable.
   */
  const renderMark = async (
    mark: Extract<MarkSource, { kind: 'ink' | 'text' }>,
  ): Promise<Uint8Array> => {
    const doc = await openAssetDocument(blankLibraryPdf());
    try {
      const layout = await doc.pages.list();
      const scratch = layout.pages[0];
      if (!scratch) throw new EngineError(EngineErrorCode.Unknown, '[stamp] no scratch page');
      const page = doc.page(scratch.ref);
      if (!page.annotations.exportAppearance) {
        throw new EngineError(
          EngineErrorCode.NotImplemented,
          '[stamp] authoring a mark needs an asset engine that can export annotation appearances',
        );
      }
      const color = hexColor(mark.color ?? '#1d2b53');
      const created =
        mark.kind === 'ink'
          ? await page.annotations.create({
              subtype: 'ink',
              inkList: mark.strokes.map((stroke) => stroke.map(({ x, y }) => ({ x, y }))),
              rect: inkBounds(mark.strokes, mark.strokeWidth ?? 2),
              color,
              strokeWidth: mark.strokeWidth ?? 2,
            })
          : await page.annotations.create({
              subtype: 'free-text',
              intent: 'free-text',
              contents: mark.text,
              fontFamily: mark.fontFamily,
              fontSize: mark.fontSize ?? 36,
              textAlign: 'left',
              rect: textBounds(mark.text, mark.fontSize ?? 36),
              fontColor: color,
              strokeWidth: 0,
            });
      return new Uint8Array(await page.annotations.exportAppearance([created.created.ref]));
    } finally {
      await doc.close();
    }
  };

  /** One page of a PDF as a single-page PDF (a `pdf` mark with `pageIndex`). */
  const extractPage = async (bytes: Uint8Array, pageIndex: number): Promise<Uint8Array> => {
    const doc = await openAssetDocument(bytes);
    try {
      const layout = await doc.pages.list();
      const page = layout.pages[pageIndex];
      if (!page) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `[stamp] the PDF has no page ${pageIndex} (${layout.pageCount} pages)`,
        );
      }
      return await doc.pages.extract([page.ref]);
    } finally {
      await doc.close();
    }
  };

  /** The bytes an asset is made from: the caller's `source`, or its `mark` authored into one. */
  const resolveAssetSource = async (
    input: AddAssetInput,
  ): Promise<{ bytes: ArrayBuffer; mimeType?: string }> => {
    if ((input.source === undefined) === (input.mark === undefined)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        '[stamp] addAsset takes exactly one of `source` / `mark`',
      );
    }
    if (input.source !== undefined) return resolveBinarySource(input.source);
    const mark = input.mark!;
    switch (mark.kind) {
      case 'image':
        return resolveBinarySource(mark.source);
      case 'pdf': {
        const resolved = await resolveBinarySource(mark.source);
        if (mark.pageIndex === undefined) return resolved;
        return {
          bytes: toArrayBuffer(await extractPage(new Uint8Array(resolved.bytes), mark.pageIndex)),
        };
      }
      case 'ink':
      case 'text':
        return { bytes: toArrayBuffer(await renderMark(mark)) };
    }
  };

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
      binaries.set(appended.asset.id, { bytes: appended.bytes, preview: appended.preview });
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

  const dropLibrary = (id: string): void => {
    const library = ctx.getState().libraries[id];
    if (library) {
      for (const assetId of library.assetIds) {
        binaries.delete(assetId);
        ghostRenders.delete(assetId);
      }
    }
    libraryBinaries.delete(id);
    ctx.dispatch({ type: 'LIBRARY_REMOVED', libraryId: id });
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
      binaries.delete(id);
      ghostRenders.delete(id);
      ctx.dispatch({ type: 'ASSET_REMOVED', assetId: id });
      libraryChanged.emit({ libraryId: library.id, reason: 'asset-removed' });
      assetDeleted.emit({ assetId: id, libraryId: library.id, asset: null });
    });
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
    const bin = binaries.get(assetId);
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

  /** Which asset this plugin armed per document. The annotation plugin owns
   *  the arm itself (a tool switch disarms it), so the answer is checked
   *  against it and forgotten once it no longer holds one. */
  const armedByDocument = new Map<string, string>();
  const armedAsset = (documentId: string): StampAsset | null => {
    const assetId = armedByDocument.get(documentId);
    if (assetId === undefined) return null;
    // Pure: a stale entry (the annotation plugin dropped the payload on a tool
    // change) reads as nothing armed and is overwritten by the next arm.
    const annotation = ctx.tryForDocument(AnnotationHostToken, documentId);
    if (!annotation?.hasArmedStamp()) return null;
    return ctx.getState().assets[assetId] ?? null;
  };

  /**
   * Ghost renders, one per size bucket per asset, rendered lazily on the
   * asset engine the first time the ghost is shown at that size and kept
   * until the asset goes away. Materialized (dynamic) placements are
   * user/time specific and cache only for their own arm (`cacheKey` null).
   */
  const ghostRenders = new Map<string, Map<number, Promise<StampAssetPreview | null>>>();

  const renderGhost = async (bytes: Uint8Array, devicePixelWidth: number) => {
    const doc = await openAssetDocument(new Uint8Array(bytes));
    try {
      const layout = await doc.pages.list();
      const page = layout.pages[0];
      if (!page) return null;
      return imageToPreview(
        await doc.page(page.ref).render.image({
          viewport: { kind: 'width', width: devicePixelWidth },
          background: 'transparent',
          includeAnnotations: true,
          format: 'png',
        }),
      );
    } finally {
      await doc.close();
    }
  };

  /** A resolution-aware ghost source for placement bytes: the page renders
   *  at the requested width, cached per bucket under `cacheKey` when given. */
  const ghostProvider = (
    bytes: Uint8Array,
    fallback: StampAssetPreview | null,
    cacheKey: string | null,
  ): StampPreviewProvider => {
    const local = cacheKey ? (ghostRenders.get(cacheKey) ?? new Map()) : new Map();
    if (cacheKey) ghostRenders.set(cacheKey, local);
    return (devicePixelWidth) => {
      let pending = local.get(devicePixelWidth);
      if (!pending) {
        pending = renderGhost(bytes, devicePixelWidth).catch((error) => {
          globalThis.console?.warn('[stamp] ghost render failed, using the thumbnail:', error);
          return fallback;
        });
        local.set(devicePixelWidth, pending);
      }
      return pending;
    };
  };

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

  const placeAsset = async (
    documentId: string,
    assetId: string,
    placement: StampPlacement,
  ): Promise<AnnotationRef> => {
    const asset = ctx.getState().assets[assetId];
    const bin = binaries.get(assetId);
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

  ctx.cleanup(() => {
    binaries.clear();
    ghostRenders.clear();
    libraryBinaries.clear();
    libraryMutationTails.clear();
    const ownedAssetEngine = typeof config.assetEngine === 'function' ? assetEngineRef : null;
    assetEngineRef = null;
    if (ownedAssetEngine) {
      void Promise.resolve(ownedAssetEngine)
        .then((engine) => engine.destroy())
        .catch(() => {});
    }
  });

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
  const notFound = (what: string, id: string) =>
    new PluginError('not-found', 'stamp', `unknown ${what} '${id}'`);
  const canPlace = (documentId?: string): boolean => {
    const id = documentId ?? ctx.core().activeId;
    if (!id) return false;
    return ctx.tryForDocument(AnnotationToken, id)?.canCreate() ?? false;
  };

  const api: StampCapability = {
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
    getAssetPreview: (id) => binaries.get(id)?.preview ?? null,
    renderAssetPreview: (id, { width }) => {
      const bin = binaries.get(id);
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
      const bytes = binaries.get(id)?.bytes;
      return bytes ? new Uint8Array(bytes) : null;
    },
    exportLibrary: async (id) => {
      const bytes = libraryBinaries.get(id);
      if (!bytes) throw notFound('library', id);
      return new Uint8Array(bytes);
    },
    onLibraryChanged: libraryChanged.on,
    onLibraryCreated: libraryCreated.on,
    onLibraryUpdated: libraryUpdated.on,
    onLibraryDeleted: libraryDeleted.on,
    onAssetCreated: assetCreated.on,
    onAssetUpdated: assetUpdated.on,
    onAssetDeleted: assetDeleted.on,
    onArmChanged: armChanged.on,
    createLibrary,
    updateLibrary,
    importLibrary: importLibraryPdf,
    createAsset: addAsset,
    createAssetFromAnnotations: (documentId, page, refs, input) =>
      addAssetFromAnnotations(documentId, page, [...refs], input),
    updateAsset,
    deleteAsset: removeAsset,
    deleteLibrary: removeLibrary,
    moveAsset: async (id, to) => {
      const asset = ctx.getState().assets[id];
      const bin = binaries.get(id);
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
      const bin = binaries.get(id);
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
    canPlace,
    canImport: () => importSupported !== false,
  };
  return api;
}
