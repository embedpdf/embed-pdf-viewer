import {
  EngineError,
  EngineErrorCode,
  resolveBinarySource,
  sniffBinaryMetadata,
  type BinarySource,
  type DocumentHandle,
  type Engine,
  type PageImageHandle,
  type PieceInfoEntry,
  type PieceInfoPatch,
} from '@embedpdf/engine-core/runtime';
import { deferredEngine, type PluginContext } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation';
import { createFormScriptingController, type FormCommitResult } from '@embedpdf/plugin-form';

import type {
  AddAssetInput,
  ImportLibraryOptions,
  StampAction,
  StampAsset,
  StampAssetPreview,
  StampCapability,
  StampConfig,
  StampLibrary,
  StampAssetKind,
  StampState,
} from './types';

const DEFAULT_PREVIEW_WIDTH = 256;
const LIBRARY_PIECEINFO_APP = 'EMBD_StampLibrary';
const STAMP_PIECEINFO_APP = 'EMBD_Stamp';
const STAMP_SCHEMA_VERSION = 1;

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

const kindToPdfName = (kind: StampAssetKind): string =>
  kind === 'signature' ? 'Signature' : kind === 'initials' ? 'Initials' : 'Stamp';

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

const metadataPatch = (
  id: string,
  name: string,
  kind: StampAssetKind,
  subject?: string,
  categories?: readonly string[],
): PieceInfoPatch => ({
  Version: STAMP_SCHEMA_VERSION,
  Id: id,
  Name: name,
  Kind: { name: kindToPdfName(kind) },
  Subject: subject ?? null,
  Categories: categories ?? null,
});

const libraryMetadataPatch = (
  id: string,
  name: string,
  categories?: readonly string[],
): PieceInfoPatch => ({
  Version: STAMP_SCHEMA_VERSION,
  Id: id,
  Name: name,
  Kind: { name: 'StampLibrary' },
  Categories: categories ?? null,
});

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

  // The ASSET ENGINE port. A configured factory is wrapped in deferredEngine
  // (boot on first import, not at viewer start); a configured instance is used
  // as-is; nothing configured falls back to the kernel's engine — correct for
  // local deployments, and rejected with an actionable error by cloud engines
  // at the first `open({ kind: 'bytes' })`.
  let assetEngineRef: Engine | null = null;
  const assetEngine = (): Engine => {
    if (!assetEngineRef) {
      const cfg = config.assetEngine;
      assetEngineRef = !cfg ? ctx.engine : typeof cfg === 'function' ? deferredEngine(cfg) : cfg;
    }
    return assetEngineRef;
  };

  const openAssetDocument = async (
    bytes: Uint8Array,
    identity?: DocumentHandle['security']['identity'],
  ): Promise<DocumentHandle> => {
    try {
      return await assetEngine().open(
        { kind: 'bytes', id: uid('stamp-import'), bytes },
        { scope: ['*'], ...(identity ? { identity } : {}) },
      );
    } catch (err) {
      // A cloud kernel engine rejects 'bytes' with InvalidArg — turn the
      // generic contract error into the configuration fix.
      if (!config.assetEngine && EngineError.is(err, EngineErrorCode.InvalidArg)) {
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

  const createLooseLibrary = (name: string): string => {
    const id = uid('stamp-lib');
    ctx.dispatch({
      type: 'LIBRARY_ADDED',
      library: { id, name, storage: 'loose', assetIds: [] },
    });
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
      if (!doc.pieceInfo || !doc.pages.extract) {
        throw new EngineError(
          EngineErrorCode.NotImplemented,
          '[stamp] canonical PDF libraries need an asset engine with pieceInfo and pages.extract',
        );
      }
      const snapshot = await doc.pages.list();
      if (snapshot.pageCount === 0) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          '[stamp] a canonical stamp library PDF must contain at least one page',
        );
      }

      // Discover and validate every required service before the first write.
      const pages = snapshot.pages.map((layout) => {
        const handle = doc.page(layout.pageObjectNumber);
        if (!handle.pieceInfo) {
          throw new EngineError(
            EngineErrorCode.NotImplemented,
            '[stamp] canonical PDF libraries need page pieceInfo support',
          );
        }
        return {
          layout,
          handle,
          metadata: null as Awaited<ReturnType<typeof handle.pieceInfo.read>>,
        };
      });

      const catalogMetadata = await doc.pieceInfo.read(LIBRARY_PIECEINFO_APP);
      for (const page of pages) {
        page.metadata = await page.handle.pieceInfo!.read(STAMP_PIECEINFO_APP);
      }

      const state = ctx.getState();
      const takenLibraryIds = new Set(Object.keys(state.libraries));
      const takenAssetIds = new Set(Object.keys(state.assets));
      const catalogEntries = catalogMetadata?.entries ?? {};
      const libraryId = allocateId(entryString(catalogEntries, 'Id'), 'stamp-lib', takenLibraryIds);
      const libraryName = opts?.name ?? entryString(catalogEntries, 'Name') ?? 'Stamps';
      const libraryCategories = opts?.categories ?? entryStringArray(catalogEntries, 'Categories');

      const descriptors = pages.map(({ layout, handle, metadata: pageMetadata }) => {
        const entries = pageMetadata?.entries ?? {};
        const id = allocateId(entryString(entries, 'Id'), 'stamp', takenAssetIds);
        const kind = opts?.kind ?? kindFromPdfName(entryName(entries, 'Kind')) ?? 'stamp';
        return {
          handle,
          asset: {
            id,
            libraryId,
            kind,
            name:
              opts?.assetName?.(layout.index) ??
              entryString(entries, 'Name') ??
              `Stamp ${layout.index + 1}`,
            size: { width: layout.size.width, height: layout.size.height },
            format: 'pdf' as const,
            pageObjectNumber: layout.pageObjectNumber,
            subject: entryString(entries, 'Subject'),
            categories: entryStringArray(entries, 'Categories'),
          },
        };
      });

      await doc.pieceInfo.update(
        LIBRARY_PIECEINFO_APP,
        libraryMetadataPatch(libraryId, libraryName, libraryCategories),
      );

      const assets: NonNullable<typeof imported>['assets'] = [];
      for (const descriptor of descriptors) {
        const { asset, handle } = descriptor;
        await handle.pieceInfo!.update(
          STAMP_PIECEINFO_APP,
          metadataPatch(asset.id, asset.name, asset.kind, asset.subject, asset.categories),
        );
        // One canonical page → one derived placement PDF plus a transparent
        // preview. Extract after metadata so the cache carries the same id.
        const bytes = await doc.pages.extract([asset.pageObjectNumber!]);
        const image = await handle.render.image({
          viewport: { kind: 'width', width: config.previewWidth ?? DEFAULT_PREVIEW_WIDTH },
          background: 'transparent',
          includeAnnotations: true,
          format: 'png',
        });
        assets.push({ asset, bytes, preview: imageToPreview(image) });
      }

      imported = {
        library: {
          id: libraryId,
          name: libraryName,
          storage: 'canonical-pdf',
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
    return imported.library.id;
  };

  const addAsset = async (input: AddAssetInput): Promise<string> => {
    const targetLibrary = input.libraryId
      ? (ctx.getState().libraries[input.libraryId] ?? null)
      : null;
    if (input.libraryId && !targetLibrary) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `[stamp] unknown library '${input.libraryId}'`,
      );
    }
    const resolved = await resolveBinarySource(input.source);
    const meta = sniffBinaryMetadata(resolved.bytes);
    if (!meta) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        '[stamp] asset source must be PNG, JPEG, or single-page PDF bytes',
      );
    }
    const isPdf = meta.mimeType === 'application/pdf';

    let suppliedPreview: StampAssetPreview | null = null;
    if (input.preview) {
      const preview = await resolveBinarySource(input.preview);
      suppliedPreview = {
        bytes: new Uint8Array(preview.bytes),
        mimeType: preview.mimeType ?? 'image/png',
      };
    }

    if (targetLibrary?.storage === 'canonical-pdf') {
      if (!isPdf) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          '[stamp] raster assets cannot be appended to a canonical PDF library',
        );
      }
      return mutateLibrary(targetLibrary.id, async () => {
        const liveLibrary = ctx.getState().libraries[targetLibrary.id];
        if (liveLibrary?.storage !== 'canonical-pdf') {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `[stamp] canonical library '${targetLibrary.id}' no longer exists`,
          );
        }
        const canonicalBytes = libraryBinaries.get(liveLibrary.id);
        if (!canonicalBytes) {
          throw new EngineError(
            EngineErrorCode.Unknown,
            `[stamp] canonical bytes are missing for library '${liveLibrary.id}'`,
          );
        }

        const assetId = uid('stamp');
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
          if (!doc.pages.insert || !doc.pages.extract) {
            throw new EngineError(
              EngineErrorCode.NotImplemented,
              '[stamp] appending to a canonical library needs pages.insert and pages.extract',
            );
          }
          const result = await doc.pages.insert(new Uint8Array(resolved.bytes));
          if (result.insertedPageObjectNumbers.length !== 1) {
            throw new EngineError(
              EngineErrorCode.InvalidArg,
              '[stamp] a canonical library asset must be a single-page PDF',
            );
          }
          const pageObjectNumber = result.insertedPageObjectNumbers[0];
          const layout = result.layout.pages.find(
            (candidate) => candidate.pageObjectNumber === pageObjectNumber,
          );
          const page = doc.page(pageObjectNumber);
          if (!layout || !page.pieceInfo) {
            throw new EngineError(
              EngineErrorCode.NotImplemented,
              '[stamp] canonical PDF libraries need page layout and pieceInfo support',
            );
          }
          const asset: StampAsset = {
            id: assetId,
            libraryId: liveLibrary.id,
            kind: input.kind ?? 'stamp',
            name: input.name,
            size: { width: layout.size.width, height: layout.size.height },
            format: 'pdf',
            pageObjectNumber,
            subject: input.subject,
            categories: input.categories,
          };
          await page.pieceInfo.update(
            STAMP_PIECEINFO_APP,
            metadataPatch(asset.id, asset.name, asset.kind, asset.subject, asset.categories),
          );
          const bytes = await doc.pages.extract([pageObjectNumber]);
          let preview = suppliedPreview;
          if (!preview) {
            preview = imageToPreview(
              await page.render.image({
                viewport: { kind: 'width', width: config.previewWidth ?? DEFAULT_PREVIEW_WIDTH },
                background: 'transparent',
                includeAnnotations: true,
                format: 'png',
              }),
            );
          }
          appended = { asset, bytes, preview, canonical: await doc.download() };
        } finally {
          await doc.close();
        }

        libraryBinaries.set(liveLibrary.id, appended.canonical);
        binaries.set(appended.asset.id, { bytes: appended.bytes, preview: appended.preview });
        ctx.dispatch({ type: 'ASSET_ADDED', asset: appended.asset });
        return appended.asset.id;
      });
    }

    const size =
      input.size ?? ('width' in meta ? { width: meta.width, height: meta.height } : null);
    if (!size) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        '[stamp] a PDF asset needs `size` (its page size in points) — PDF bytes carry no sniffable dimensions',
      );
    }
    let preview = suppliedPreview;
    if (!preview && !isPdf) {
      preview = { bytes: new Uint8Array(resolved.bytes), mimeType: meta.mimeType };
    }
    const commitLooseAsset = (libraryId: string): string => {
      const asset: StampAsset = {
        id: uid('stamp'),
        libraryId,
        kind: input.kind ?? 'stamp',
        name: input.name,
        size,
        format: isPdf ? 'pdf' : meta.mimeType === 'image/png' ? 'png' : 'jpeg',
        subject: input.subject,
        categories: input.categories,
      };
      binaries.set(asset.id, { bytes: new Uint8Array(resolved.bytes), preview });
      ctx.dispatch({ type: 'ASSET_ADDED', asset });
      return asset.id;
    };
    if (!targetLibrary) return commitLooseAsset(createLooseLibrary(input.name));
    return mutateLibrary(targetLibrary.id, async () => {
      const liveLibrary = ctx.getState().libraries[targetLibrary.id];
      if (liveLibrary?.storage !== 'loose') {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `[stamp] loose library '${targetLibrary.id}' no longer exists`,
        );
      }
      return commitLooseAsset(liveLibrary.id);
    });
  };

  const dropLibrary = (id: string): void => {
    const library = ctx.getState().libraries[id];
    if (library) for (const assetId of library.assetIds) binaries.delete(assetId);
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
      if (library?.storage === 'canonical-pdf') {
        if (library.assetIds.length === 1) {
          dropLibrary(library.id);
          return;
        }
        if (asset.pageObjectNumber === undefined) {
          throw new EngineError(
            EngineErrorCode.Unknown,
            `[stamp] canonical asset '${id}' has no page object number`,
          );
        }
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
          await doc.pages.delete([asset.pageObjectNumber]);
          rewritten = await doc.download();
        } finally {
          await doc.close();
        }
        libraryBinaries.set(library.id, rewritten);
      }
      binaries.delete(id);
      ctx.dispatch({ type: 'ASSET_REMOVED', assetId: id });
    });
  };

  const removeLibrary = (id: string): Promise<void> =>
    mutateLibrary(id, async () => dropLibrary(id));

  const surfaceScriptingResult = (result: FormCommitResult): void => {
    try {
      for (const effect of result.uiEffects) config.scripting?.onUiEffect?.(effect);
      for (const diagnostic of result.diagnostics) {
        config.scripting?.onDiagnostic?.(diagnostic);
      }
      if (result.error) config.scripting?.onError?.(result.error);
    } catch (error) {
      globalThis.console?.error('[stamp] scripting observer failed:', error);
    }
  };

  /**
   * Form-backed stamps are executable templates only until placement. Work
   * on an isolated copy so neither the canonical library nor its reusable
   * per-page extraction becomes target/user/time specific.
   */
  const materializeForPlacement = async (
    documentId: string,
    asset: StampAsset,
    bin: { bytes: Uint8Array; preview: StampAssetPreview | null },
  ): Promise<{ bytes: Uint8Array; preview: StampAssetPreview | null }> => {
    if (asset.format !== 'pdf' || !config.scripting?.enabled) return bin;

    const targetDoc = ctx.documentHandle(documentId);
    const targetMeta = ctx.core().documents[documentId] ?? null;
    if (!targetDoc || !targetMeta) {
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
    const doc = await openAssetDocument(new Uint8Array(sourceBytes), targetDoc.security.identity);
    let scripting: ReturnType<typeof createFormScriptingController> | null = null;
    try {
      const layout = await doc.pages.list();
      const selectedPage =
        asset.pageObjectNumber === undefined
          ? layout.pageCount === 1
            ? layout.pages[0]
            : undefined
          : layout.pages.find(
              ({ pageObjectNumber }) => pageObjectNumber === asset.pageObjectNumber,
            );
      if (!selectedPage) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          canonicalBytes
            ? `[stamp] canonical page ${asset.pageObjectNumber ?? 'unknown'} no longer exists`
            : '[stamp] a loose dynamic stamp asset must contain exactly one page',
        );
      }
      const snapshot = await doc.forms.list();
      const hasSelectedPageField = snapshot.fields.some((field) =>
        field.widgets.some(
          ({ pageObjectNumber }) => pageObjectNumber === selectedPage.pageObjectNumber,
        ),
      );
      if (!hasSelectedPageField) return bin;
      if (!doc.pages.flatten || !doc.pages.extract) {
        throw new EngineError(
          EngineErrorCode.NotImplemented,
          '[stamp] dynamic PDF stamps need an asset engine with pages.flatten and pages.extract',
        );
      }

      const scriptingConfig = config.scripting;
      scripting = createFormScriptingController({
        doc,
        document: () => targetMeta,
        config: scriptingConfig,
        sandboxFactory:
          scriptingConfig.sandboxFactory ??
          (() =>
            import('@embedpdf/core-js-sandbox').then(({ createQuickJsSandbox }) =>
              createQuickJsSandbox(),
            )),
      });
      const result = await scripting.recalculate(snapshot);
      surfaceScriptingResult(result);
      if (result.status === 'failed') {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `[stamp] dynamic stamp scripting failed: ${result.error?.message ?? 'native form effect failed'}`,
        );
      }

      const pageObjectNumber = selectedPage.pageObjectNumber;
      const flattened = await doc.pages.flatten([pageObjectNumber], 'display');
      const failed = flattened.results.find(
        ({ status }) => status === 'failed' || status === 'skipped',
      );
      if (failed) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `[stamp] dynamic stamp flatten failed for page ${failed.pageObjectNumber}`,
        );
      }

      const bytes = await doc.pages.extract([pageObjectNumber]);
      const image = await doc.page(pageObjectNumber).render.image({
        viewport: { kind: 'width', width: config.previewWidth ?? DEFAULT_PREVIEW_WIDTH },
        background: 'transparent',
        includeAnnotations: false,
        format: 'png',
      });
      return { bytes, preview: imageToPreview(image) };
    } finally {
      scripting?.dispose();
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
      source: placement.bytes,
      preview: placement.preview
        ? { data: placement.preview.bytes, mimeType: placement.preview.mimeType }
        : undefined,
      intrinsicSize: asset.size,
      targetWidth: opts?.targetWidth,
    });
  };

  ctx.cleanup(() => {
    binaries.clear();
    libraryBinaries.clear();
    libraryMutationTails.clear();
    const ownedAssetEngine = typeof config.assetEngine === 'function' ? assetEngineRef : null;
    assetEngineRef = null;
    if (ownedAssetEngine) void ownedAssetEngine.destroy();
  });

  return {
    libraries: () => {
      const s = ctx.getState();
      return s.libraryOrder.map((id) => s.libraries[id]).filter((l) => l != null);
    },
    library: (id) => ctx.getState().libraries[id] ?? null,
    assets: (libraryId) => {
      const s = ctx.getState();
      if (libraryId) {
        const library = s.libraries[libraryId];
        return library ? library.assetIds.map((id) => s.assets[id]).filter((a) => a != null) : [];
      }
      return s.libraryOrder.flatMap((lid) =>
        (s.libraries[lid]?.assetIds ?? []).map((id) => s.assets[id]).filter((a) => a != null),
      );
    },
    asset: (id) => ctx.getState().assets[id] ?? null,
    assetPreview: (id) => binaries.get(id)?.preview ?? null,
    assetBytes: (id) => binaries.get(id)?.bytes ?? null,
    libraryBytes: (id) => libraryBinaries.get(id) ?? null,
    importLibraryPdf,
    addAsset,
    removeAsset,
    removeLibrary,
    armAsset,
    disarm: (documentId) => ctx.forDocument(AnnotationToken, documentId).disarmStamp(),
  };
}
