import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type {
  DocumentHandle,
  Engine,
  PieceInfoEntry,
  PieceInfoPatch,
  PieceInfoSnapshot,
} from '@embedpdf/engine-core/runtime';
import type { DocumentMeta, PluginContext } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { createStampCapability } from '../src/capability';
import { initialStampState, stampReducer } from '../src/reducer';
import type { StampAction, StampState } from '../src/types';

/** Minimal PDF bytes — enough for the magic-byte sniff. */
const pdfBytes = () => new TextEncoder().encode('%PDF-1.7\n%fake fixture\n');

const here = dirname(fileURLToPath(import.meta.url));
const dynamicStampFixture = resolve(here, 'fixtures', 'EmbedPDF_Dynamic_Approval_Stamp.pdf');

/** Minimal PNG header: signature + IHDR with width=100, height=50. */
const pngBytes = () => {
  const b = new Uint8Array(32);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const dv = new DataView(b.buffer);
  dv.setUint32(8, 13); // IHDR length
  b.set([0x49, 0x48, 0x44, 0x52], 12); // 'IHDR'
  dv.setUint32(16, 100); // width
  dv.setUint32(20, 50); // height
  return b;
};

/** A live store + PluginContext stub: dispatch runs the real reducer. */
function makeCtx(
  engine: Engine,
  annotation?: Record<string, unknown>,
  target?: { id: string; handle: DocumentHandle; meta: DocumentMeta },
) {
  let state: StampState = initialStampState();
  const ctx = {
    id: 'stamp',
    engine,
    doc: null,
    getState: () => state,
    dispatch: (action: StampAction) => {
      state = stampReducer(state, action);
    },
    subscribe: () => () => {},
    core: () => ({
      documents: target ? { [target.id]: target.meta } : {},
      order: target ? [target.id] : [],
      activeId: target?.id ?? null,
    }),
    document: () => target?.meta ?? null,
    documentHandle: (documentId?: string) =>
      target && (documentId === undefined || documentId === target.id) ? target.handle : null,
    cleanup: () => {},
    forDocument: <T>(_token: unknown, documentId: string): T => {
      if (!annotation) throw new Error(`no annotation for '${documentId}'`);
      return annotation as T;
    },
  } as unknown as PluginContext<StampState, StampAction>;
  return ctx;
}

const toEntry = (value: Exclude<PieceInfoPatch[string], null>): PieceInfoEntry => {
  if (typeof value === 'string') return { type: 'string', value };
  if (typeof value === 'number') return { type: 'number', value };
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (Array.isArray(value)) return { type: 'string-array', value: [...value] };
  return { type: 'name', value: value.name };
};

type MetadataSeed = Record<string, PieceInfoEntry>;

/** An asset-engine stub with mutable pages, PieceInfo, extraction and saves. */
function makeAssetEngine(
  pageCount: number,
  seed?: { catalog?: MetadataSeed; pages?: Record<number, MetadataSeed> },
) {
  let pages = Array.from({ length: pageCount }, (_, i) => ({
    pageObjectNumber: 100 + i,
    index: i,
    size: { width: 200 + i, height: 100 + i },
  }));
  const catalogEntries = { ...(seed?.catalog ?? {}) };
  const pageEntries = new Map<number, MetadataSeed>(
    pages.map((page) => [
      page.pageObjectNumber,
      { ...(seed?.pages?.[page.pageObjectNumber] ?? {}) },
    ]),
  );
  const close = vi.fn(async () => {});
  const extract = vi.fn(async (pons: number[]) => new TextEncoder().encode(`%PDF-page-${pons[0]}`));
  const insert = vi.fn(async () => {
    const pageObjectNumber = Math.max(99, ...pages.map((page) => page.pageObjectNumber)) + 1;
    pages = [
      ...pages,
      {
        pageObjectNumber,
        index: pages.length,
        size: { width: 300, height: 120 },
      },
    ];
    pageEntries.set(pageObjectNumber, {});
    return {
      insertedPageObjectNumbers: [pageObjectNumber],
      layout: { pageCount: pages.length, pages },
      cache: null,
    };
  });
  const deletePages = vi.fn(async (pons: number[]) => {
    pages = pages
      .filter((page) => !pons.includes(page.pageObjectNumber))
      .map((page, index) => ({ ...page, index }));
    for (const pon of pons) pageEntries.delete(pon);
    return { layout: { pageCount: pages.length, pages }, cache: null };
  });
  let saveNumber = 0;
  const download = vi.fn(async () => new TextEncoder().encode(`%PDF-canonical-${++saveNumber}`));

  const pieceInfo = (entries: MetadataSeed) => ({
    read: vi.fn(
      async (): Promise<PieceInfoSnapshot | null> =>
        Object.keys(entries).length === 0 ? null : { entries: { ...entries }, lastModified: null },
    ),
    update: vi.fn(async (_application: string, patch: PieceInfoPatch) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete entries[key];
        else entries[key] = toEntry(value);
      }
    }),
    applications: vi.fn(async () => []),
    clear: vi.fn(async () => {}),
  });

  const catalogPieceInfo = pieceInfo(catalogEntries);
  const pageServices = new Map<number, ReturnType<typeof pieceInfo>>();
  const pageService = (pon: number) => {
    let service = pageServices.get(pon);
    if (!service) {
      const entries = pageEntries.get(pon) ?? {};
      pageEntries.set(pon, entries);
      service = pieceInfo(entries);
      pageServices.set(pon, service);
    }
    return service;
  };
  const handle = {
    pieceInfo: catalogPieceInfo,
    pages: {
      list: async () => ({ pageCount: pages.length, pages }),
      extract,
      insert,
      delete: deletePages,
    },
    page: (pon: number) => ({
      pieceInfo: pageService(pon),
      render: {
        image: async () => ({
          contentType: 'image/png',
          source: { kind: 'bytes', bytes: new TextEncoder().encode(`png-${pon}`) },
        }),
      },
    }),
    download,
    close,
  };
  const engine = { open: vi.fn(async () => handle) } as unknown as Engine;
  return {
    engine,
    close,
    extract,
    insert,
    deletePages,
    download,
    catalogEntries,
    pageEntries,
  };
}

describe('stamp plugin — library import', () => {
  it('imports a PDF: one vector asset per page, previews cached, doc closed', async () => {
    const { engine, close, extract } = makeAssetEngine(2);
    const cap = createStampCapability(makeCtx(engine));

    const libraryId = await cap.importLibraryPdf(pdfBytes(), { name: 'Approvals' });

    const libs = cap.libraries();
    expect(libs).toHaveLength(1);
    expect(libs[0]).toMatchObject({ name: 'Approvals', storage: 'canonical-pdf' });
    expect(new TextDecoder().decode(cap.libraryBytes(libraryId)!)).toBe('%PDF-canonical-1');
    const assets = cap.assets(libraryId);
    expect(assets).toHaveLength(2);
    expect(assets[0]).toMatchObject({
      kind: 'stamp',
      name: 'Stamp 1',
      size: { width: 200, height: 100 },
      format: 'pdf',
    });
    // Per-asset binaries: the extracted single-page PDF + its preview render.
    expect(new TextDecoder().decode(cap.assetBytes(assets[0].id)!)).toBe('%PDF-page-100');
    expect(cap.assetPreview(assets[0].id)).toMatchObject({ mimeType: 'image/png' });
    expect(extract).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reads stable ids and display metadata from catalog/page PieceInfo', async () => {
    const { engine, catalogEntries, pageEntries } = makeAssetEngine(1, {
      catalog: {
        Id: { type: 'string', value: 'review-library' },
        Name: { type: 'string', value: 'Review' },
        Categories: { type: 'string-array', value: ['Team'] },
      },
      pages: {
        100: {
          Id: { type: 'string', value: 'approved-stamp' },
          Name: { type: 'string', value: 'Approved' },
          Kind: { type: 'name', value: 'Signature' },
          Subject: { type: 'string', value: 'Approval signature' },
          Categories: { type: 'string-array', value: ['Review'] },
        },
      },
    });
    const cap = createStampCapability(makeCtx(engine));

    const libraryId = await cap.importLibraryPdf(pdfBytes());

    expect(libraryId).toBe('review-library');
    expect(cap.library(libraryId)).toMatchObject({
      name: 'Review',
      categories: ['Team'],
    });
    expect(cap.assets(libraryId)[0]).toMatchObject({
      id: 'approved-stamp',
      name: 'Approved',
      kind: 'signature',
      subject: 'Approval signature',
      categories: ['Review'],
      pageObjectNumber: 100,
    });
    // Import normalizes the schema marker and keeps metadata in the PDF.
    expect(catalogEntries.Version).toEqual({ type: 'number', value: 1 });
    expect(pageEntries.get(100)?.Version).toEqual({ type: 'number', value: 1 });
  });

  it('rejects non-PDF bytes with InvalidArg', async () => {
    const { engine } = makeAssetEngine(1);
    const cap = createStampCapability(makeCtx(engine));
    await expect(cap.importLibraryPdf(pngBytes())).rejects.toMatchObject({
      code: EngineErrorCode.InvalidArg,
    });
  });

  it('a cloud kernel engine with no configured assetEngine fails with the configuration fix', async () => {
    const cloudish = {
      open: () => {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          "cloud engine supports OpenInput kind 'token' or 'id'",
        );
      },
    } as unknown as Engine;
    const cap = createStampCapability(makeCtx(cloudish));
    await expect(cap.importLibraryPdf(pdfBytes())).rejects.toMatchObject({
      code: EngineErrorCode.NotImplemented,
      message: expect.stringContaining('assetEngine'),
    });
  });
});

describe('stamp plugin — assets', () => {
  it('addAsset sniffs raster size and uses the image itself as preview', async () => {
    const { engine } = makeAssetEngine(0);
    const cap = createStampCapability(makeCtx(engine));
    const id = await cap.addAsset({ name: 'Logo', source: pngBytes() });
    expect(cap.asset(id)).toMatchObject({
      format: 'png',
      size: { width: 100, height: 50 },
    });
    expect(cap.assetPreview(id)?.mimeType).toBe('image/png');
    // Single-asset convenience library named after the asset.
    expect(cap.libraries()[0]).toMatchObject({ name: 'Logo', storage: 'loose' });
  });

  it('a directly-added PDF asset requires an explicit size', async () => {
    const { engine } = makeAssetEngine(0);
    const cap = createStampCapability(makeCtx(engine));
    await expect(cap.addAsset({ name: 'Sig', source: pdfBytes() })).rejects.toMatchObject({
      code: EngineErrorCode.InvalidArg,
    });
    const id = await cap.addAsset({
      name: 'Sig',
      source: pdfBytes(),
      size: { width: 150, height: 60 },
    });
    expect(cap.asset(id)).toMatchObject({ format: 'pdf', size: { width: 150, height: 60 } });
    // No preview supplied and none derivable — pickers fall back, ghost stays off.
    expect(cap.assetPreview(id)).toBeNull();
  });

  it('appends a PDF page to a canonical library and writes its PieceInfo', async () => {
    const { engine, insert, pageEntries } = makeAssetEngine(1);
    const cap = createStampCapability(makeCtx(engine));
    const libraryId = await cap.importLibraryPdf(pdfBytes());

    const id = await cap.addAsset({
      libraryId,
      name: 'Signed',
      kind: 'signature',
      subject: 'Customer sign-off',
      categories: ['Signature'],
      source: pdfBytes(),
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(cap.asset(id)).toMatchObject({
      pageObjectNumber: 101,
      size: { width: 300, height: 120 },
      kind: 'signature',
    });
    expect(new TextDecoder().decode(cap.libraryBytes(libraryId)!)).toBe('%PDF-canonical-2');
    expect(pageEntries.get(101)).toMatchObject({
      Id: { type: 'string', value: id },
      Name: { type: 'string', value: 'Signed' },
      Kind: { type: 'name', value: 'Signature' },
      Subject: { type: 'string', value: 'Customer sign-off' },
      Categories: { type: 'string-array', value: ['Signature'] },
    });
    expect(cap.assetPreview(id)?.mimeType).toBe('image/png');
  });

  it('rejects raster append to a canonical PDF library', async () => {
    const { engine, insert } = makeAssetEngine(1);
    const cap = createStampCapability(makeCtx(engine));
    const libraryId = await cap.importLibraryPdf(pdfBytes());

    await expect(
      cap.addAsset({ libraryId, name: 'Logo', source: pngBytes() }),
    ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
    expect(insert).not.toHaveBeenCalled();
  });

  it('deletes a canonical page before removing its asset descriptor', async () => {
    const { engine, deletePages } = makeAssetEngine(2);
    const cap = createStampCapability(makeCtx(engine));
    const libraryId = await cap.importLibraryPdf(pdfBytes());
    const [asset] = cap.assets(libraryId);

    await cap.removeAsset(asset.id);

    expect(deletePages).toHaveBeenCalledWith([100]);
    expect(cap.asset(asset.id)).toBeNull();
    expect(cap.assets(libraryId)).toHaveLength(1);
    expect(new TextDecoder().decode(cap.libraryBytes(libraryId)!)).toBe('%PDF-canonical-2');
  });

  it('serializes removals so deleting every asset removes the canonical library cleanly', async () => {
    const { engine, deletePages } = makeAssetEngine(2);
    const cap = createStampCapability(makeCtx(engine));
    const libraryId = await cap.importLibraryPdf(pdfBytes());
    const [first, second] = cap.assets(libraryId);

    await Promise.all([cap.removeAsset(first.id), cap.removeAsset(second.id)]);

    // The first rewrite leaves one page; the queued second removal drops the
    // one-page library instead of attempting an invalid zero-page PDF save.
    expect(deletePages).toHaveBeenCalledTimes(1);
    expect(cap.library(libraryId)).toBeNull();
    expect(cap.libraryBytes(libraryId)).toBeNull();
    expect(cap.assets()).toHaveLength(0);
  });

  it('keeps state and canonical bytes unchanged when an append cannot be saved', async () => {
    const { engine, download } = makeAssetEngine(1);
    const cap = createStampCapability(makeCtx(engine));
    const libraryId = await cap.importLibraryPdf(pdfBytes());
    const beforeBytes = cap.libraryBytes(libraryId);
    download.mockRejectedValueOnce(new Error('save failed'));

    await expect(
      cap.addAsset({ libraryId, name: 'Not saved', source: pdfBytes() }),
    ).rejects.toThrow('save failed');

    expect(cap.assets(libraryId)).toHaveLength(1);
    expect(cap.libraryBytes(libraryId)).toBe(beforeBytes);
  });

  it('allocates new embedded ids when the same canonical library is imported twice', async () => {
    const { engine } = makeAssetEngine(1, {
      catalog: { Id: { type: 'string', value: 'shared-library-id' } },
      pages: { 100: { Id: { type: 'string', value: 'shared-asset-id' } } },
    });
    const cap = createStampCapability(makeCtx(engine));

    const firstLibraryId = await cap.importLibraryPdf(pdfBytes());
    const secondLibraryId = await cap.importLibraryPdf(pdfBytes());

    expect(firstLibraryId).toBe('shared-library-id');
    expect(secondLibraryId).not.toBe(firstLibraryId);
    expect(cap.libraries()).toHaveLength(2);
    expect(cap.assets()[0].id).not.toBe(cap.assets()[1].id);
  });

  it('removeLibrary drops the library, its assets, and their binaries', async () => {
    const { engine } = makeAssetEngine(2);
    const cap = createStampCapability(makeCtx(engine));
    const libraryId = await cap.importLibraryPdf(pdfBytes());
    const [a] = cap.assets(libraryId);
    await cap.removeLibrary(libraryId);
    expect(cap.libraries()).toHaveLength(0);
    expect(cap.assets()).toHaveLength(0);
    expect(cap.assetBytes(a.id)).toBeNull();
    expect(cap.libraryBytes(libraryId)).toBeNull();
  });
});

describe('stamp plugin — placement', () => {
  it('armAsset delegates to the document annotation plugin with bytes + preview + intrinsic size', async () => {
    const { engine } = makeAssetEngine(1);
    const armStamp = vi.fn(async () => {});
    const cap = createStampCapability(makeCtx(engine, { armStamp }));
    const libraryId = await cap.importLibraryPdf(pdfBytes());
    const [asset] = cap.assets(libraryId);

    await cap.armAsset('doc-1', asset.id, { targetWidth: 120 });

    expect(armStamp).toHaveBeenCalledTimes(1);
    const input = armStamp.mock.calls[0][0] as {
      source: Uint8Array;
      preview?: { data: Uint8Array; mimeType?: string };
      intrinsicSize?: { width: number; height: number };
      targetWidth?: number;
    };
    expect(new TextDecoder().decode(input.source)).toBe('%PDF-page-100');
    expect(input.preview?.mimeType).toBe('image/png');
    expect(input.intrinsicSize).toEqual({ width: 200, height: 100 });
    expect(input.targetWidth).toBe(120);
  });

  it('arming an unknown asset rejects with NotFound', async () => {
    const { engine } = makeAssetEngine(0);
    const cap = createStampCapability(makeCtx(engine, { armStamp: vi.fn() }));
    await expect(cap.armAsset('doc-1', 'nope')).rejects.toMatchObject({
      code: EngineErrorCode.NotFound,
    });
  });

  it('materializes a real form-backed stamp for the target and keeps library bytes reusable', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    // Node has no canvas encoder. Keep every PDF operation real and replace
    // only the browser-only preview encoder at the asset-engine boundary.
    const previewEngine = {
      open: async (
        input: Parameters<Engine['open']>[0],
        options?: Parameters<Engine['open']>[1],
      ) => {
        const doc = await engine.open(input, options);
        return new Proxy(doc, {
          get(targetDoc, property) {
            if (property === 'page') {
              return (pageObjectNumber: number) => {
                const page = targetDoc.page(pageObjectNumber);
                return new Proxy(page, {
                  get(targetPage, pageProperty) {
                    if (pageProperty === 'render') {
                      return new Proxy(targetPage.render, {
                        get(targetRender, renderProperty) {
                          if (renderProperty === 'image') {
                            return async () => ({
                              contentType: 'image/png',
                              source: { kind: 'bytes', bytes: pngBytes() },
                            });
                          }
                          const value = Reflect.get(targetRender, renderProperty, targetRender);
                          return typeof value === 'function' ? value.bind(targetRender) : value;
                        },
                      });
                    }
                    const value = Reflect.get(targetPage, pageProperty, targetPage);
                    return typeof value === 'function' ? value.bind(targetPage) : value;
                  },
                });
              };
            }
            const value = Reflect.get(targetDoc, property, targetDoc);
            return typeof value === 'function' ? value.bind(targetDoc) : value;
          },
        });
      },
      destroy: () => engine.destroy(),
    } as unknown as Engine;
    const fixtureBytes = new Uint8Array(await readFile(dynamicStampFixture));
    const target = await engine.open(
      { kind: 'bytes', id: 'stamp-target', bytes: fixtureBytes },
      {
        scope: ['*'],
        identity: {
          user_id: 'alex',
          group_id: 'EmbedPDF',
          display_name: 'Alex Morgan',
        },
      },
    );
    const targetPages = await target.pages.list();
    const targetMeta: DocumentMeta = {
      id: target.id,
      name: 'proposal.pdf',
      pageCount: targetPages.pageCount,
      pages: targetPages.pages,
      revision: 0,
    };
    const armStamp = vi.fn(async () => {});
    const cap = createStampCapability(
      makeCtx(engine, { armStamp }, { id: target.id, handle: target, meta: targetMeta }),
      {
        assetEngine: previewEngine,
        scripting: {
          enabled: true,
          now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
          utcOffsetMinutes: () => 180,
          randomSeed: () => 7,
        },
      },
    );

    let materialized: DocumentHandle | null = null;
    try {
      const libraryId = await cap.importLibraryPdf(fixtureBytes);
      const [asset] = cap.assets(libraryId);
      const canonicalBefore = new Uint8Array(cap.libraryBytes(libraryId)!);
      const baseBefore = new Uint8Array(cap.assetBytes(asset.id)!);

      await cap.armAsset(target.id, asset.id);

      expect(cap.libraryBytes(libraryId)).toEqual(canonicalBefore);
      expect(cap.assetBytes(asset.id)).toEqual(baseBefore);
      expect(armStamp).toHaveBeenCalledTimes(1);
      const armed = armStamp.mock.calls[0][0] as {
        source: Uint8Array;
        preview?: { data: Uint8Array; mimeType?: string };
      };
      expect(armed.source).not.toEqual(baseBefore);
      expect(armed.preview?.mimeType).toBe('image/png');

      materialized = await engine.open(
        { kind: 'bytes', id: 'materialized-stamp', bytes: armed.source },
        { scope: ['*'] },
      );
      const forms = await materialized.forms.list();
      const pages = await materialized.pages.list();
      const annotations = await materialized
        .page(pages.pages[0].pageObjectNumber)
        .annotations.list();
      expect(forms.fields).toHaveLength(0);
      expect(annotations.annotations).toHaveLength(0);
    } finally {
      if (materialized) await materialized.close();
      await target.close();
      await engine.destroy();
    }
  });
});
