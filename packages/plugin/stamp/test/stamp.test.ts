import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  EngineError,
  EngineErrorCode,
  LOCAL_ENGINE_BRAND,
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import type {
  DocumentHandle,
  Engine,
  LocalEngine,
  PageRef,
  PieceInfoEntry,
  PieceInfoPatch,
  PieceInfoSnapshot,
} from '@embedpdf/engine-core/runtime';
import { DocumentsToken, type CapabilityToken } from '@embedpdf/core';
import { createTestContext, type TestPage } from '@embedpdf/core/testing';
import { createLocalEngine } from '@embedpdf/engine';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import type { ScriptRealmTarget } from '@embedpdf/plugin-actions/contract/host';
import { AnnotationToken, type StampInput } from '@embedpdf/plugin-annotation/contract';

import { createScriptRealmFactory } from '../../actions/src/scripting/environment';
import { STAMP_DEFAULTS, type StampConfig } from '../src/contract';
import { stampPlugin } from '../src/stamp.plugin';
import { stampState } from '../src/state';
import { createStampController } from '../src/controller';
import { initialStampState } from '../src/model';

/** Minimal PDF bytes: enough for the magic-byte sniff. */
const pdfBytes = () => new TextEncoder().encode('%PDF-1.7\n%fake fixture\n');

const here = dirname(fileURLToPath(import.meta.url));
const dynamicStampFixture = resolve(here, 'fixtures', 'EmbedPDF_Dynamic_Approval_Stamp.pdf');

/** Minimal PNG header: the signature and an `IHDR` chunk with width=100, height=50. */
const pngBytes = () => {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // chunk length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // chunk type `IHDR`
  view.setUint32(16, 100); // width
  view.setUint32(20, 50); // height
  return bytes;
};

/**
 * The stamp capability over a real kernel context. The optional target
 * document is what placement and "from a selection" address; its annotation
 * and actions plugins are stubs at their contracts.
 */
function makeStamp(
  engine: Engine,
  options: {
    annotation?: Record<string, unknown>;
    target?: { id: string; handle?: DocumentHandle; pages?: readonly TestPage[] };
    actions?: Record<string, unknown>;
    config?: StampConfig;
  } = {},
) {
  const capabilities: [CapabilityToken<unknown>, unknown][] = [];
  if (options.annotation) capabilities.push([AnnotationToken, options.annotation]);
  if (options.actions) capabilities.push([ActionsToken, options.actions]);
  const ctx = createTestContext({
    id: 'stamp',
    state: initialStampState(),
    settings: { defaults: STAMP_DEFAULTS, registered: options.config, whole: ['assetEngine'] },
    engine,
    documentId: options.target?.id,
    doc: options.target?.handle ?? null,
    pages: options.target?.pages,
    capabilities,
  });
  return { ctx, stamp: ctx.connect(createStampController(ctx)) };
}

// `Array.isArray` does not narrow a readonly array out of a union.
const isStringArray = (value: unknown): value is readonly string[] => Array.isArray(value);

const toEntry = (value: Exclude<PieceInfoPatch[string], null>): PieceInfoEntry => {
  if (typeof value === 'string') return { type: 'string', value };
  if (typeof value === 'number') return { type: 'number', value };
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (isStringArray(value)) return { type: 'string-array', value: [...value] };
  return { type: 'name', value: value.name };
};

type MetadataSeed = Record<string, PieceInfoEntry>;

/** An asset-engine stub with mutable pages, PieceInfo, extraction and saves. */
function makeAssetEngine(
  pageCount: number,
  seed?: {
    catalog?: MetadataSeed;
    pages?: Record<number, MetadataSeed>;
    /** `/Names /Pages` registry: key → page object number (tree order = insertion order). */
    names?: Record<string, number>;
    /** `/Names /Templates` entries (hidden pages, never listed as pages). */
    templates?: Record<string, number>;
    title?: string;
  },
) {
  let pages = Array.from({ length: pageCount }, (_, i) => ({
    ref: toPageRef(100 + i),
    index: i,
    size: { width: 200 + i, height: 100 + i },
  }));
  const names = new Map<string, number>(Object.entries(seed?.names ?? {}));
  const templates = new Map<string, number>(Object.entries(seed?.templates ?? {}));
  let title: string | null = seed?.title ?? null;
  const namedPages = () => [
    ...[...names.entries()].map(([name, pageObjectNumber]) => ({
      name,
      target: pages.some((page) => page.ref.objectNumber === pageObjectNumber)
        ? { kind: 'page' as const, page: toPageRef(pageObjectNumber) }
        : { kind: 'dangling' as const },
    })),
    ...[...templates.entries()].map(([name, objectNumber]) => ({
      name,
      target: { kind: 'template' as const, objectNumber },
    })),
  ];
  const layout = () => ({ pageCount: pages.length, pages, namedPages: namedPages() });
  const setName = vi.fn(async (input: { name: string; page: PageRef; replace?: string }) => {
    if (input.replace !== undefined) names.delete(input.replace);
    names.delete(input.name);
    names.set(input.name, input.page.objectNumber);
    return { layout: layout(), meta: { affectedPages: [], cacheDelta: null } };
  });
  const removeName = vi.fn(async (input: { name: string }) => {
    names.delete(input.name);
    return { layout: layout(), meta: { affectedPages: [], cacheDelta: null } };
  });
  const catalogEntries = { ...(seed?.catalog ?? {}) };
  const pageEntries = new Map<number, MetadataSeed>(
    pages.map((page) => [
      page.ref.objectNumber,
      { ...(seed?.pages?.[page.ref.objectNumber] ?? {}) },
    ]),
  );
  const close = vi.fn(async () => {});
  const extract = vi.fn(async (refs: PageRef[]) =>
    new TextEncoder().encode(`%PDF-page-${refs[0].objectNumber}`),
  );
  const insert = vi.fn(async (_bytes: Uint8Array | ArrayBuffer, _toIndex?: number) => {
    const pageObjectNumber = Math.max(99, ...pages.map((page) => page.ref.objectNumber)) + 1;
    pages = [
      ...pages,
      {
        ref: toPageRef(pageObjectNumber),
        index: pages.length,
        size: { width: 300, height: 120 },
      },
    ];
    pageEntries.set(pageObjectNumber, {});
    return {
      insertedPages: [toPageRef(pageObjectNumber)],
      layout: layout(),
      meta: { affectedPages: [], cacheDelta: null },
    };
  });
  const insertBlank = vi.fn(async (spec: { size: { width: number; height: number } }) => {
    const pageObjectNumber = Math.max(99, ...pages.map((page) => page.ref.objectNumber)) + 1;
    pages = [
      ...pages,
      { ref: toPageRef(pageObjectNumber), index: pages.length, size: { ...spec.size } },
    ];
    pageEntries.set(pageObjectNumber, {});
    return {
      insertedPages: [toPageRef(pageObjectNumber)],
      layout: layout(),
      meta: { affectedPages: [], cacheDelta: null },
    };
  });
  const createAnnotation = vi.fn(async () => ({ annotation: { ref: {} } }));
  const flatten = vi.fn(async (refs: PageRef[]) => ({
    pages: refs,
    usage: 'display',
    results: refs.map((page) => ({ page, status: 'applied' })),
    meta: { affectedPages: [], cacheDelta: null },
  }));
  const deletePages = vi.fn(async (refs: PageRef[]) => {
    const deleted = refs.map((ref) => ref.objectNumber);
    pages = pages
      .filter((page) => !deleted.includes(page.ref.objectNumber))
      .map((page, index) => ({ ...page, index }));
    for (const pageObjectNumber of deleted) {
      pageEntries.delete(pageObjectNumber);
      // The engine drops registrations of a deleted page inside the delete.
      for (const [name, target] of [...names.entries()]) {
        if (target === pageObjectNumber) names.delete(name);
      }
    }
    return { layout: layout(), meta: { affectedPages: [], cacheDelta: null } };
  });
  let saveNumber = 0;
  const download = vi.fn(async () => new TextEncoder().encode(`%PDF-canonical-${++saveNumber}`));

  const pieceInfo = (entries: MetadataSeed) => ({
    get: vi.fn(
      async (): Promise<PieceInfoSnapshot | null> =>
        Object.keys(entries).length === 0 ? null : { entries: { ...entries }, modifiedAt: null },
    ),
    update: vi.fn(async (_application: string, patch: PieceInfoPatch) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete entries[key];
        else entries[key] = toEntry(value);
      }
    }),
    list: vi.fn(async () => []),
    delete: vi.fn(async () => {}),
  });

  const catalogPieceInfo = pieceInfo(catalogEntries);
  const pageServices = new Map<number, ReturnType<typeof pieceInfo>>();
  const pageService = (pageObjectNumber: number) => {
    let service = pageServices.get(pageObjectNumber);
    if (!service) {
      const entries = pageEntries.get(pageObjectNumber) ?? {};
      pageEntries.set(pageObjectNumber, entries);
      service = pieceInfo(entries);
      pageServices.set(pageObjectNumber, service);
    }
    return service;
  };
  const metadata = {
    get: vi.fn(async () => ({ title })),
    update: vi.fn(async (patch: { title?: string | null }) => {
      if (patch.title !== undefined) title = patch.title;
      return { title };
    }),
  };
  const handle = {
    pieceInfo: catalogPieceInfo,
    metadata,
    pages: {
      list: async () => layout(),
      extract,
      insert,
      insertBlank,
      flatten,
      delete: deletePages,
      setName,
      removeName,
    },
    page: ({ objectNumber: pageObjectNumber }: PageRef) => ({
      pieceInfo: pageService(pageObjectNumber),
      annotations: { create: createAnnotation },
      render: {
        image: async () => ({
          contentType: 'image/png',
          source: { kind: 'bytes', bytes: new TextEncoder().encode(`png-${pageObjectNumber}`) },
        }),
      },
    }),
    download,
    close,
  };
  const engine = {
    [LOCAL_ENGINE_BRAND]: true,
    open: vi.fn(async () => handle),
  } as unknown as LocalEngine;
  return {
    engine,
    close,
    extract,
    insert,
    deletePages,
    download,
    catalogEntries,
    pageEntries,
    names,
    setName,
    removeName,
    metadata,
    insertBlank,
    createAnnotation,
    flatten,
    title: () => title,
  };
}

describe('stamp plugin: library import', () => {
  it('imports a PDF: one vector asset per page, previews cached, doc closed', async () => {
    const { engine, close, extract, names, title } = makeAssetEngine(2);
    const { stamp } = makeStamp(engine);

    const libraryId = (await stamp.importLibrary(pdfBytes(), { name: 'Approvals' })).library.id;

    const libraries = stamp.listLibraries();
    expect(libraries).toHaveLength(1);
    // No /Title in the PDF: the caller's fallback names it, and is written
    // back as the title so the exported library names itself from then on.
    expect(libraries[0]).toMatchObject({ name: 'Approvals' });
    expect(title()).toBe('Approvals');
    expect(new TextDecoder().decode(await stamp.exportLibrary(libraryId))).toBe('%PDF-canonical-1');
    const assets = stamp.listAssets({ libraryId: libraryId });
    expect(assets).toHaveLength(2);
    // A plain PDF: every page is a stamp, registered so the export is
    // Acrobat-readable. Identity = `${libraryId}:${identifier}`.
    expect(assets[0]).toMatchObject({
      id: `${libraryId}:Stamp1`,
      kind: 'stamp',
      name: 'Stamp1',
      label: 'Stamp1',
      size: { width: 200, height: 100 },
    });
    expect([...names.entries()]).toEqual([
      ['Stamp1=Stamp1', 100],
      ['Stamp2=Stamp2', 101],
    ]);
    // Per-asset binaries: the extracted single-page PDF + its preview render.
    expect(new TextDecoder().decode(stamp.readAssetBytes(assets[0].id)!)).toBe('%PDF-page-100');
    expect(stamp.getAssetPreview(assets[0].id)).toMatchObject({ mimeType: 'image/png' });
    expect(extract).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reads a format version 1 library: PieceInfo names become the registry, the format moves to version 2', async () => {
    const { engine, catalogEntries, pageEntries, names, title } = makeAssetEngine(1, {
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
    const { stamp } = makeStamp(engine);

    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;

    expect(libraryId).toBe('review-library');
    expect(stamp.getLibrary(libraryId)).toMatchObject({
      name: 'Review',
      categories: ['Team'],
    });
    // The format version 1 `Name` is the identifier and `Subject` the label,
    // now the registry key; the asset id derives from them, not from `Id`.
    expect(stamp.listAssets({ libraryId: libraryId })[0]).toMatchObject({
      id: 'review-library:Approved',
      name: 'Approved',
      label: 'Approval signature',
      kind: 'signature',
      categories: ['Review'],
      page: toPageRef(100),
    });
    expect(stamp.listAssets({ libraryId: libraryId })[0].subject).toBeUndefined();
    expect([...names.entries()]).toEqual([['Approved=Approval signature', 100]]);
    expect(title()).toBe('Review');
    // Import moves the file to format version 2: names leave PieceInfo for their standard homes.
    expect(catalogEntries.Version).toEqual({ type: 'number', value: 2 });
    expect(catalogEntries.Name).toBeUndefined();
    expect(pageEntries.get(100)?.Version).toEqual({ type: 'number', value: 2 });
    expect(pageEntries.get(100)?.Name).toBeUndefined();
    expect(pageEntries.get(100)?.Subject).toBeUndefined();
  });

  it('imports an Acrobat-style registry: keys `identifier=label`, page order, hidden templates ignored', async () => {
    const { engine, setName } = makeAssetEngine(3, {
      title: 'Standaard stempels',
      // Tree order is key-sorted; page order is what the picker shows.
      names: { 'Approved=Goedgekeurd': 101, '#alpha=Alpha': 100, 'Draft=Concept': 102 },
      templates: { 'Tpl=Hidden': 900 },
    });
    const { stamp } = makeStamp(engine);

    const libraryId = (await stamp.importLibrary(pdfBytes(), { name: 'ignored fallback' })).library
      .id;

    expect(stamp.getLibrary(libraryId)?.name).toBe('Standaard stempels');
    expect(
      stamp
        .listAssets({ libraryId: libraryId })
        .map((asset) => [asset.name, asset.label, asset.page.objectNumber]),
    ).toEqual([
      ['#alpha', 'Alpha', 100],
      ['Approved', 'Goedgekeurd', 101],
      ['Draft', 'Concept', 102],
    ]);
    // A registered library is imported as-is: nothing re-registered.
    expect(setName).not.toHaveBeenCalled();
  });

  it('rejects a registry with a duplicate identifier', async () => {
    const { engine } = makeAssetEngine(2, {
      names: { 'Approved=One': 100, 'Approved=Two': 101 },
    });
    const { stamp } = makeStamp(engine);
    await expect(stamp.importLibrary(pdfBytes())).rejects.toMatchObject({
      name: 'PluginError',
      code: 'invalid-input',
      message: expect.stringContaining("duplicate stamp identifier 'Approved'"),
    });
  });

  it('rejects non-PDF bytes with invalid-input', async () => {
    const { engine } = makeAssetEngine(1);
    const { stamp } = makeStamp(engine);
    await expect(stamp.importLibrary(pngBytes())).rejects.toMatchObject({
      name: 'PluginError',
      code: 'invalid-input',
    });
  });

  it('a cloud kernel engine with no configured assetEngine fails with the configuration fix, and canImport turns false for every reader', async () => {
    const cloudish = {
      open: () => {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          "cloud engine supports OpenInput kind 'token' or 'id'",
        );
      },
    } as unknown as Engine;
    const { ctx, stamp } = makeStamp(cloudish);
    const woken = vi.fn();
    ctx.subscribe(woken);
    expect(stamp.canImport()).toBe(true);
    await expect(stamp.importLibrary(pdfBytes())).rejects.toMatchObject({
      name: 'PluginError',
      code: 'unsupported',
      message: expect.stringContaining('assetEngine'),
    });
    expect(stamp.canImport()).toBe(false);
    expect(woken).toHaveBeenCalled();
  });
});

describe('stamp plugin: assets', () => {
  it('a raster asset becomes a page: blank page its size, image flattened in, registered', async () => {
    const { engine, insertBlank, createAnnotation, flatten, names, title } = makeAssetEngine(0);
    const { stamp } = makeStamp(engine);
    const id = (
      await stamp.createAsset({ name: 'Logo', label: 'Company logo', source: pngBytes() })
    ).asset.id;

    // No library named: one of its own, a real PDF titled after the label.
    const [library] = stamp.listLibraries();
    expect(library).toMatchObject({ name: 'Company logo', assetIds: [id] });
    expect(title()).toBe('Company logo');
    expect(insertBlank).toHaveBeenCalledWith({ size: { width: 100, height: 50 } });
    expect(createAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ subtype: 'stamp', fit: 'fill' }),
      { resources: { appearance: expect.any(Uint8Array) } },
    );
    expect(flatten).toHaveBeenCalledWith([toPageRef(100)], { usage: 'display' });
    expect(names.get('Logo=Company logo')).toBe(100);
    expect(stamp.getAsset(id)).toMatchObject({
      id: `${library.id}:Logo`,
      name: 'Logo',
      label: 'Company logo',
      size: { width: 100, height: 50 },
      page: toPageRef(100),
    });
    expect(stamp.getAssetPreview(id)?.mimeType).toBe('image/png');
  });

  it('a PDF asset needs no size (its page has one); a supplied preview wins', async () => {
    const { engine } = makeAssetEngine(0);
    const { stamp } = makeStamp(engine);
    const id = (await stamp.createAsset({ name: 'Sig', source: pdfBytes(), preview: pngBytes() }))
      .asset.id;
    expect(stamp.getAsset(id)).toMatchObject({
      size: { width: 300, height: 120 },
      page: toPageRef(100),
    });
    expect(stamp.getAssetPreview(id)?.mimeType).toBe('image/png');
  });

  it('createLibrary makes an empty PDF library; removing the last asset keeps it', async () => {
    const { engine, deletePages } = makeAssetEngine(0);
    const { stamp } = makeStamp(engine);
    const seen: string[] = [];
    stamp.onLibraryChanged((change) => seen.push(change.reason));
    const libraryId = (await stamp.createLibrary('Mine', { id: 'mine', categories: ['custom'] }))
      .library.id;
    expect(libraryId).toBe('mine');
    expect(stamp.getLibrary(libraryId)).toMatchObject({
      name: 'Mine',
      categories: ['custom'],
      assetIds: [],
    });
    expect(await stamp.exportLibrary(libraryId)).not.toBeNull();

    const id = (await stamp.createAsset({ libraryId, name: 'One', source: pdfBytes() })).asset.id;
    await stamp.deleteAsset(id);
    expect(deletePages).toHaveBeenCalledWith([toPageRef(100)]);
    expect(stamp.getLibrary(libraryId)).toMatchObject({ assetIds: [] });
    expect(await stamp.exportLibrary(libraryId)).not.toBeNull();
    expect(seen).toEqual(['created', 'asset-added', 'asset-removed']);
  });

  it('appends a PDF page to a canonical library and writes its PieceInfo', async () => {
    const { engine, insert, pageEntries, names } = makeAssetEngine(1);
    const { stamp } = makeStamp(engine);
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;

    const id = (
      await stamp.createAsset({
        libraryId,
        name: 'Signed',
        kind: 'signature',
        subject: 'Customer sign-off',
        categories: ['Signature'],
        source: pdfBytes(),
      })
    ).asset.id;

    expect(insert).toHaveBeenCalledTimes(1);
    expect(id).toBe(`${libraryId}:Signed`);
    expect(stamp.getAsset(id)).toMatchObject({
      name: 'Signed',
      label: 'Signed',
      page: toPageRef(101),
      size: { width: 300, height: 120 },
      kind: 'signature',
      subject: 'Customer sign-off',
    });
    expect(new TextDecoder().decode(await stamp.exportLibrary(libraryId))).toBe('%PDF-canonical-2');
    // Insert copies the page only; the registry entry is written in the same mutation.
    expect(names.get('Signed=Signed')).toBe(101);
    expect(pageEntries.get(101)).toMatchObject({
      Kind: { type: 'name', value: 'Signature' },
      SubjectOverride: { type: 'string', value: 'Customer sign-off' },
      Categories: { type: 'string-array', value: ['Signature'] },
    });
    expect(pageEntries.get(101)?.Name).toBeUndefined();
    expect(stamp.getAssetPreview(id)?.mimeType).toBe('image/png');
  });

  it('rejects a duplicate identifier within a library', async () => {
    const { engine, insert } = makeAssetEngine(1);
    const { stamp } = makeStamp(engine);
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;

    await expect(
      stamp.createAsset({ libraryId, name: 'Stamp1', source: pdfBytes() }),
    ).rejects.toMatchObject({ name: 'PluginError', code: 'invalid-input' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('deletes a canonical page before removing its asset descriptor', async () => {
    const { engine, deletePages } = makeAssetEngine(2);
    const { stamp } = makeStamp(engine);
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const [asset] = stamp.listAssets({ libraryId: libraryId });

    await stamp.deleteAsset(asset.id);

    expect(deletePages).toHaveBeenCalledWith([toPageRef(100)]);
    expect(stamp.getAsset(asset.id)).toBeNull();
    expect(stamp.listAssets({ libraryId: libraryId })).toHaveLength(1);
    expect(new TextDecoder().decode(await stamp.exportLibrary(libraryId))).toBe('%PDF-canonical-2');
  });

  it('serializes concurrent removals: each rewrite starts from the previous bytes', async () => {
    const { engine, deletePages } = makeAssetEngine(2);
    const { stamp } = makeStamp(engine);
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const [first, second] = stamp.listAssets({ libraryId: libraryId });

    await Promise.all([stamp.deleteAsset(first.id), stamp.deleteAsset(second.id)]);

    expect(deletePages).toHaveBeenCalledTimes(2);
    expect(stamp.getLibrary(libraryId)).toMatchObject({ assetIds: [] });
    expect(new TextDecoder().decode(await stamp.exportLibrary(libraryId))).toBe('%PDF-canonical-3');
    expect(stamp.listAssets()).toHaveLength(0);
  });

  it('keeps state and canonical bytes unchanged when an append cannot be saved', async () => {
    const { engine, download } = makeAssetEngine(1);
    const { stamp } = makeStamp(engine);
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const beforeBytes = await stamp.exportLibrary(libraryId);
    download.mockRejectedValueOnce(new Error('save failed'));

    await expect(
      stamp.createAsset({ libraryId, name: 'Not saved', source: pdfBytes() }),
    ).rejects.toMatchObject({
      name: 'PluginError',
      code: 'operation-failed',
      message: 'save failed',
    });

    expect(stamp.listAssets({ libraryId: libraryId })).toHaveLength(1);
    expect(await stamp.exportLibrary(libraryId)).toEqual(beforeBytes);
  });

  it('allocates new embedded ids when the same canonical library is imported twice', async () => {
    const { engine } = makeAssetEngine(1, {
      catalog: { Id: { type: 'string', value: 'shared-library-id' } },
      pages: { 100: { Id: { type: 'string', value: 'shared-asset-id' } } },
    });
    const { stamp } = makeStamp(engine);

    const firstLibraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const secondLibraryId = (await stamp.importLibrary(pdfBytes())).library.id;

    expect(firstLibraryId).toBe('shared-library-id');
    expect(secondLibraryId).not.toBe(firstLibraryId);
    expect(stamp.listLibraries()).toHaveLength(2);
    expect(stamp.listAssets()[0].id).not.toBe(stamp.listAssets()[1].id);
  });

  it('removeLibrary drops the library, its assets, and their binaries', async () => {
    const { engine } = makeAssetEngine(2);
    const { stamp } = makeStamp(engine);
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const [asset] = stamp.listAssets({ libraryId: libraryId });
    await stamp.deleteLibrary(libraryId);
    expect(stamp.listLibraries()).toHaveLength(0);
    expect(stamp.listAssets()).toHaveLength(0);
    expect(stamp.readAssetBytes(asset.id)).toBeNull();
    await expect(stamp.exportLibrary(libraryId)).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('stamp plugin: authoring', () => {
  it('updateAsset relabels through a registry rename and keeps the identifier', async () => {
    const { engine, setName, names, pageEntries } = makeAssetEngine(1, {
      names: { 'Approved=Approved': 100 },
    });
    const { stamp } = makeStamp(engine);
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const [asset] = stamp.listAssets({ libraryId: libraryId });

    await stamp.updateAsset(asset.id, { label: 'Goedgekeurd', subject: 'Akkoord' });

    expect(setName).toHaveBeenCalledWith({
      name: 'Approved=Goedgekeurd',
      page: toPageRef(100),
      replace: 'Approved=Approved',
    });
    expect([...names.entries()]).toEqual([['Approved=Goedgekeurd', 100]]);
    expect(stamp.getAsset(asset.id)).toMatchObject({
      id: asset.id,
      name: 'Approved',
      label: 'Goedgekeurd',
      subject: 'Akkoord',
    });
    expect(pageEntries.get(100)?.SubjectOverride).toEqual({ type: 'string', value: 'Akkoord' });
    expect(new TextDecoder().decode(await stamp.exportLibrary(libraryId))).toBe('%PDF-canonical-2');

    await stamp.updateAsset(asset.id, { subject: null });
    expect(stamp.getAsset(asset.id)?.subject).toBeUndefined();
  });

  it('onLibraryChanged fires for every canonical change with its reason', async () => {
    const { engine } = makeAssetEngine(2);
    const { stamp } = makeStamp(engine);
    const seen: string[] = [];
    const off = stamp.onLibraryChanged((change) =>
      seen.push(`${change.libraryId}:${change.reason}`),
    );

    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const added = (await stamp.createAsset({ libraryId, name: 'New', source: pdfBytes() })).asset
      .id;
    await stamp.updateAsset(added, { label: 'Renamed' });
    await stamp.deleteAsset(added);
    await stamp.deleteLibrary(libraryId);
    off();
    await stamp.importLibrary(pdfBytes());

    expect(seen).toEqual([
      `${libraryId}:imported`,
      `${libraryId}:asset-added`,
      `${libraryId}:asset-updated`,
      `${libraryId}:asset-removed`,
      `${libraryId}:removed`,
    ]);
  });
});

describe('stamp plugin: from a selection', () => {
  it('addAssetFromAnnotations exports the selection as one page and adds it', async () => {
    const { engine, insert } = makeAssetEngine(1);
    const exportAppearance = vi.fn(async () => new TextEncoder().encode('%PDF-exported'));
    const target = {
      page: (page: PageRef) => ({ annotations: { exportAppearance }, page }),
    } as unknown as DocumentHandle;
    const { stamp } = makeStamp(engine, {
      target: { id: 'doc-1', handle: target, pages: [{ ref: toPageRef(5) }] },
    });
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const refs = [{ kind: 'objectNumber' as const, page: toPageRef(5), objectNumber: 9 }];

    const id = (
      await stamp.createAssetFromAnnotations(
        toPageRef(5),
        refs,
        { libraryId, label: 'My mark' },
        { documentId: 'doc-1' },
      )
    ).asset.id;

    expect(exportAppearance).toHaveBeenCalledWith(refs);
    expect(new TextDecoder().decode(insert.mock.calls[0][0] as Uint8Array)).toBe('%PDF-exported');
    const asset = stamp.getAsset(id)!;
    // An Acrobat-style identifier, the caller's label.
    expect(asset.name).toMatch(/^#[A-Za-z0-9]{22}$/);
    expect(asset.label).toBe('My mark');
    expect(asset.libraryId).toBe(libraryId);
  });
});

describe('stamp plugin: placement', () => {
  it('armAsset delegates to the document annotation plugin with bytes + preview + intrinsic size', async () => {
    const { engine } = makeAssetEngine(1);
    const armStamp = vi.fn(async (_input: StampInput) => {});
    const { stamp } = makeStamp(engine, {
      annotation: { canCreate: () => true, stamps: { arm: armStamp, isArmed: () => true } },
    });
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const [asset] = stamp.listAssets({ libraryId: libraryId });

    await stamp.armAsset(asset.id, { documentId: 'doc-1', targetWidth: 120 });

    expect(armStamp).toHaveBeenCalledTimes(1);
    const input = armStamp.mock.calls[0][0] as {
      source: Uint8Array;
      preview?: (
        devicePixelWidth: number,
      ) => Promise<{ bytes: Uint8Array; mimeType?: string } | null>;
      intrinsicSize?: { width: number; height: number };
      targetWidth?: number;
    };
    expect(new TextDecoder().decode(input.source)).toBe('%PDF-page-100');
    // The ghost is resolution-aware: a provider that renders the placement
    // page at the requested device width (a PNG from the asset engine).
    expect(typeof input.preview).toBe('function');
    expect((await input.preview!(512))?.mimeType).toBe('image/png');
    expect(input.intrinsicSize).toEqual({ width: 200, height: 100 });
    expect(input.targetWidth).toBe(120);
    // The identity a placement writes: /Name = identifier, /Subj = the label.
    expect(input).toMatchObject({ name: 'Stamp1', subject: 'Stamp1' });
  });

  it('placeAsset places without the pointer through the same payload', async () => {
    const { engine } = makeAssetEngine(1, { names: { 'Approved=Goedgekeurd': 100 } });
    const ref = { kind: 'objectNumber', page: toPageRef(7), objectNumber: 42 };
    const placeStamp = vi.fn(async () => ({ annotation: { ref } }));
    const { stamp } = makeStamp(engine, {
      annotation: { canCreate: () => true, stamps: { place: placeStamp } },
    });
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const [asset] = stamp.listAssets({ libraryId: libraryId });

    const placed = await stamp.placeAsset(
      asset.id,
      { page: toPageRef(7), center: { x: 100, y: 200 }, targetWidth: 90 },
      { documentId: 'doc-1' },
    );

    expect(placed.annotation.ref).toBe(ref);
    expect(placeStamp).toHaveBeenCalledTimes(1);
    const [payload, placement] = placeStamp.mock.calls[0] as unknown as [
      { name?: string; subject?: string; intrinsicSize?: unknown },
      unknown,
    ];
    expect(payload).toMatchObject({
      name: 'Approved',
      subject: 'Goedgekeurd',
      intrinsicSize: { width: 200, height: 100 },
    });
    expect(placement).toEqual({
      page: toPageRef(7),
      center: { x: 100, y: 200 },
      targetWidth: 90,
    });
  });

  it('arming an unknown asset rejects with not-found', async () => {
    const { engine } = makeAssetEngine(0);
    const { stamp } = makeStamp(engine, {
      annotation: { canCreate: () => true, stamps: { arm: vi.fn() } },
    });
    await expect(stamp.armAsset('nope', { documentId: 'doc-1' })).rejects.toMatchObject({
      name: 'PluginError',
      code: 'not-found',
    });
  });

  it('arming and disarming announce the arm and wake readers of the armed asset', async () => {
    const { engine } = makeAssetEngine(1);
    let armed = false;
    const annotation = {
      canCreate: () => true,
      stamps: {
        arm: vi.fn(async () => {
          armed = true;
        }),
        disarm: vi.fn(() => {
          armed = false;
        }),
        isArmed: () => armed,
      },
    };
    const { ctx, stamp } = makeStamp(engine, { annotation });
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const [asset] = stamp.listAssets({ libraryId });
    const changes: (string | null)[] = [];
    stamp.onArmChanged((event) => changes.push(event.asset?.id ?? null));
    const woken = vi.fn();
    ctx.subscribe(woken);

    await stamp.armAsset(asset.id, { documentId: 'doc-1' });
    expect(stamp.getArmedAsset('doc-1')?.id).toBe(asset.id);
    expect(woken).toHaveBeenCalledTimes(1);

    stamp.disarm('doc-1');
    expect(stamp.getArmedAsset('doc-1')).toBeNull();
    expect(woken).toHaveBeenCalledTimes(2);
    // Disarming what is not armed announces nothing.
    stamp.disarm('doc-1');
    expect(changes).toEqual([asset.id, null]);
  });

  it('announces a disarm the annotation plugin made on its own', async () => {
    const { engine } = makeAssetEngine(1);
    let armed = false;
    const annotation = {
      canCreate: () => true,
      stamps: {
        arm: vi.fn(async () => {
          armed = true;
        }),
        disarm: vi.fn(),
        isArmed: () => armed,
      },
    };
    const { ctx, stamp } = makeStamp(engine, { annotation });
    const libraryId = (await stamp.importLibrary(pdfBytes())).library.id;
    const [asset] = stamp.listAssets({ libraryId });
    await stamp.armAsset(asset.id, { documentId: 'doc-1' });
    const changes: (string | null)[] = [];
    stamp.onArmChanged((event) => changes.push(event.asset?.id ?? null));

    // A tool switch in the annotation plugin drops the arm and wakes readers.
    armed = false;
    ctx.notify();

    expect(stamp.getArmedAsset('doc-1')).toBeNull();
    expect(changes).toEqual([null]);
    expect(annotation.stamps.disarm).not.toHaveBeenCalled();
  });

  it('materializes a real form-backed stamp for the target and keeps library bytes reusable', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    // Node has no canvas encoder. Keep every PDF operation real and replace
    // only the browser-only preview encoder at the asset-engine boundary.
    const previewEngine = {
      [LOCAL_ENGINE_BRAND]: true,
      open: async (
        input: Parameters<Engine['open']>[0],
        options?: Parameters<Engine['open']>[1],
      ) => {
        const doc = await engine.open(input, options);
        return new Proxy(doc, {
          get(targetDoc, property) {
            if (property === 'page') {
              return (ref: PageRef) => {
                const page = targetDoc.page(ref);
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
    } as unknown as LocalEngine;
    const fixtureBytes = new Uint8Array(await readFile(dynamicStampFixture));
    const target = await engine.open(
      { kind: 'bytes', id: 'stamp-target', bytes: fixtureBytes },
      {
        scope: ['*'],
        identity: {
          userId: 'alex',
          organization: 'EmbedPDF',
          displayName: 'Alex Morgan',
        },
      },
    );
    const targetPages = await target.pages.list();
    const armStamp = vi.fn(async (_input: StampInput) => {});
    // The target document's actions host lens, as the real plugin builds it:
    // one realm factory under the target's identity, minting detached realms.
    const realms = createScriptRealmFactory(
      {
        now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
        utcOffsetMinutes: () => 180,
        randomSeed: () => 7,
      },
      () => undefined,
      target,
    );
    const surfaced: unknown[] = [];
    const actionsHost = {
      createDetachedScriptRealm: (realmTarget: ScriptRealmTarget) => {
        const host = realms.realmFor(realmTarget);
        return {
          transaction: host.transaction.bind(host),
          budget: realms.budget,
          dispose: () => host.dispose(),
        };
      },
      surfaceScriptCommit: (commit: unknown, context: unknown) => {
        surfaced.push({ commit, context });
      },
    };
    const { stamp } = makeStamp(engine, {
      annotation: { canCreate: () => true, stamps: { arm: armStamp, isArmed: () => true } },
      target: {
        id: target.id,
        pages: targetPages.pages.map((page) => ({ ref: page.ref, size: page.size })),
      },
      actions: actionsHost,
      config: { assetEngine: previewEngine },
    });

    let materialized: DocumentHandle | null = null;
    try {
      const libraryId = (await stamp.importLibrary(fixtureBytes)).library.id;
      const [asset] = stamp.listAssets({ libraryId: libraryId });
      const canonicalBefore = new Uint8Array(await stamp.exportLibrary(libraryId));
      const baseBefore = new Uint8Array(stamp.readAssetBytes(asset.id)!);

      await stamp.armAsset(asset.id, { documentId: target.id });

      expect(await stamp.exportLibrary(libraryId)).toEqual(canonicalBefore);
      expect(stamp.readAssetBytes(asset.id)).toEqual(baseBefore);
      expect(armStamp).toHaveBeenCalledTimes(1);
      const armed = armStamp.mock.calls[0][0] as {
        source: Uint8Array;
        preview?: (
          devicePixelWidth: number,
        ) => Promise<{ bytes: Uint8Array; mimeType?: string } | null>;
      };
      expect(armed.source).not.toEqual(baseBefore);
      expect((await armed.preview!(256))?.mimeType).toBe('image/png');
      expect(surfaced).toHaveLength(1);
      expect((surfaced[0] as { context: unknown }).context).toEqual({
        origin: 'user',
        realm: 'detached',
      });

      materialized = await engine.open(
        { kind: 'bytes', id: 'materialized-stamp', bytes: armed.source },
        { scope: ['*'] },
      );
      const forms = await materialized.forms.list();
      const pages = await materialized.pages.list();
      const annotations = await materialized.page(pages.pages[0].ref).annotations.list();
      expect(forms.fields).toHaveLength(0);
      expect(annotations.annotations).toHaveLength(0);
    } finally {
      if (materialized) await materialized.close();
      await target.close();
      await engine.destroy();
    }
  });
});

describe('stamp plugin: library kinds', () => {
  it('a library is created for a kind, written to the file, and filtered by it', async () => {
    const { engine, catalogEntries } = makeAssetEngine(0);
    const { stamp } = makeStamp(engine);
    const stamps = (await stamp.createLibrary('Mine')).library.id;
    const signer = (await stamp.createLibrary('Bob Singor', { kind: 'signatures' })).library.id;
    const custom = (await stamp.createLibrary('Review marks', { kind: 'toolbar' })).library.id;

    expect(stamp.getLibrary(stamps)).toMatchObject({ kind: 'stamps' });
    expect(stamp.getLibrary(signer)).toMatchObject({ kind: 'signatures', name: 'Bob Singor' });
    // The last write is the toolbar library's: its kind is written as given.
    expect(catalogEntries.Kind).toEqual({ type: 'name', value: 'toolbar' });

    expect(stamp.listLibraries().map((library) => library.id)).toEqual([stamps, signer, custom]);
    expect(stamp.listLibraries({ kind: 'stamps' }).map((library) => library.id)).toEqual([stamps]);
    expect(stamp.listLibraries({ kind: 'signatures' }).map((library) => library.id)).toEqual([
      signer,
    ]);
    expect(
      stamp.listLibraries({ kind: ['stamps', 'toolbar'] }).map((library) => library.id),
    ).toEqual([stamps, custom]);
  });

  it('imports the kind the file declares, defaults a stamp library to stamps, and lets the caller override', async () => {
    const signatures = makeAssetEngine(1, {
      catalog: { Kind: { type: 'name', value: 'SignatureLibrary' } },
      title: 'Alice',
    });
    const { stamp: signaturesStamp } = makeStamp(signatures.engine);
    const aliceId = (await signaturesStamp.importLibrary(pdfBytes())).library.id;
    expect(signaturesStamp.getLibrary(aliceId)).toMatchObject({
      kind: 'signatures',
      name: 'Alice',
    });
    expect(signatures.catalogEntries.Kind).toEqual({ type: 'name', value: 'SignatureLibrary' });

    const stamps = makeAssetEngine(1, {
      catalog: { Kind: { type: 'name', value: 'StampLibrary' } },
    });
    const { stamp: stampsStamp } = makeStamp(stamps.engine);
    expect(
      stampsStamp.getLibrary((await stampsStamp.importLibrary(pdfBytes())).library.id),
    ).toMatchObject({
      kind: 'stamps',
    });

    const overridden = makeAssetEngine(1);
    const { stamp: overriddenStamp } = makeStamp(overridden.engine);
    const id = (await overriddenStamp.importLibrary(pdfBytes(), { libraryKind: 'toolbar' })).library
      .id;
    expect(overriddenStamp.getLibrary(id)).toMatchObject({ kind: 'toolbar' });
    expect(overridden.catalogEntries.Kind).toEqual({ type: 'name', value: 'toolbar' });
  });

  it('updateLibrary renames through the document title and keeps the kind', async () => {
    const { engine, metadata, catalogEntries } = makeAssetEngine(0);
    const { stamp } = makeStamp(engine);
    const seen: string[] = [];
    stamp.onLibraryChanged((change) => seen.push(change.reason));
    const id = (await stamp.createLibrary('Bob', { kind: 'signatures' })).library.id;
    await stamp.updateLibrary(id, { name: 'Bob Singor', categories: ['personal'] });
    expect(metadata.update).toHaveBeenLastCalledWith({ title: 'Bob Singor' });
    expect(stamp.getLibrary(id)).toMatchObject({
      name: 'Bob Singor',
      kind: 'signatures',
      categories: ['personal'],
    });
    expect(catalogEntries.Kind).toEqual({ type: 'name', value: 'SignatureLibrary' });
    expect(catalogEntries.Categories).toEqual({ type: 'string-array', value: ['personal'] });
    expect(seen).toEqual(['created', 'updated']);
    await expect(stamp.updateLibrary('nope', { name: 'Nobody' })).rejects.toMatchObject({
      name: 'PluginError',
      code: 'not-found',
    });
  });

  it('addAsset takes exactly one of source / mark', async () => {
    const { engine } = makeAssetEngine(0);
    const { stamp } = makeStamp(engine);
    const id = (await stamp.createLibrary('Mine')).library.id;
    await expect(stamp.createAsset({ libraryId: id, name: 'A' })).rejects.toMatchObject({
      name: 'PluginError',
      code: 'invalid-input',
    });
    await expect(
      stamp.createAsset({
        libraryId: id,
        name: 'A',
        source: pdfBytes(),
        mark: { kind: 'image', source: pngBytes() },
      }),
    ).rejects.toMatchObject({ name: 'PluginError', code: 'invalid-input' });
  });
});

/** A real engine whose page renders answer a fixed PNG: Node has no canvas encoder, thumbnails do not matter here. */
function withFakeRenders(engine: Engine): LocalEngine {
  return {
    [LOCAL_ENGINE_BRAND]: true,
    open: async (input: Parameters<Engine['open']>[0], options?: Parameters<Engine['open']>[1]) => {
      const doc = await engine.open(input, options);
      return new Proxy(doc, {
        get(targetDoc, property) {
          if (property === 'page') {
            return (ref: PageRef) => {
              const page = targetDoc.page(ref);
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
  } as unknown as LocalEngine;
}

describe('stamp plugin: authoring marks (real engine)', () => {
  it('renders a drawn mark and a typed mark into vector pages the size of the mark', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const { stamp } = makeStamp(withFakeRenders(engine));
    try {
      const libraryId = (await stamp.createLibrary('Bob Singor', { kind: 'signatures' })).library
        .id;
      const drawn = (
        await stamp.createAsset({
          libraryId,
          name: 'sig',
          label: 'Signature',
          kind: 'signature',
          mark: {
            kind: 'ink',
            strokes: [
              [
                { x: 10, y: 10 },
                { x: 60, y: 70 },
                { x: 110, y: 20 },
                { x: 210, y: 60 },
              ],
            ],
            strokeWidth: 3,
          },
        })
      ).asset.id;
      const signature = stamp.getAsset(drawn)!;
      expect(signature.kind).toBe('signature');
      // The page is the mark's bounds (200 × 60) plus the stroke padding.
      expect(signature.size.width).toBeGreaterThan(200);
      expect(signature.size.width).toBeLessThan(215);
      expect(signature.size.height).toBeGreaterThan(60);
      expect(signature.size.height).toBeLessThan(75);

      const typed = (
        await stamp.createAsset({
          libraryId,
          name: 'ini',
          label: 'Initials',
          kind: 'initials',
          mark: { kind: 'text', text: 'BS', fontFamily: 'helvetica', fontSize: 40 },
        })
      ).asset.id;
      const initials = stamp.getAsset(typed)!;
      expect(initials.size.width).toBeGreaterThan(20);
      expect(initials.size.height).toBeGreaterThan(20);

      // Both are pages of the one library PDF: reopening it lists them by kind.
      const doc = await engine.open({
        kind: 'bytes',
        id: 'lib',
        bytes: await stamp.exportLibrary(libraryId),
      });
      try {
        // Two registered marks (a created library keeps its blank first page, unregistered).
        const layout = await doc.pages.list();
        expect(layout.namedPages?.filter((entry) => entry.target.kind === 'page')).toHaveLength(2);
        expect((await doc.metadata.get()).title).toBe('Bob Singor');
      } finally {
        await doc.close();
      }
      expect(stamp.listLibraries({ kind: 'signatures' })).toHaveLength(1);
      expect(stamp.listAssets({ libraryId: libraryId }).map((asset) => asset.kind)).toEqual([
        'signature',
        'initials',
      ]);
    } finally {
      await engine.destroy();
    }
  }, 60_000);
});

describe('stamp plugin: the shared contract', () => {
  /** A target document with three pages and an annotation plugin that places and arms. */
  function placing(options: { canCreate?: boolean; canDownload?: boolean } = {}) {
    const assetEngine = makeAssetEngine(1, { names: { 'Approved=Approved': 100 } });
    let armed = false;
    const placed: unknown[] = [];
    const annotation = {
      canCreate: () => options.canCreate ?? true,
      stamps: {
        arm: vi.fn(async () => {
          armed = true;
        }),
        disarm: vi.fn(() => {
          armed = false;
        }),
        isArmed: () => armed,
        place: vi.fn(async (_input: StampInput, placement: { page: PageRef }) => {
          const annotation = {
            ref: { kind: 'objectNumber', page: placement.page, objectNumber: 50 + placed.length },
          };
          placed.push(placement);
          return { annotation };
        }),
      },
    };
    const exportAppearance = vi.fn(async () => new TextEncoder().encode('%PDF-exported'));
    const pages = [toPageRef(1), toPageRef(2), toPageRef(3)];
    const made = makeStamp(assetEngine.engine, {
      annotation,
      target: {
        id: 'doc',
        pages: pages.map((ref) => ({ ref })),
        handle: {
          page: () => ({ annotations: { exportAppearance } }),
        } as unknown as DocumentHandle,
      },
    });
    if (options.canDownload === false) {
      const documents = made.ctx.get(DocumentsToken);
      made.ctx.capabilities.set(DocumentsToken, { ...documents, canDownload: () => false });
    }
    return { ...made, annotation, pages, placed, exportAppearance, assetEngine };
  }

  it('resolves what a create or an update made', async () => {
    const { stamp } = placing();
    const { library } = await stamp.createLibrary('Mine', { kind: 'review' });
    expect(library).toMatchObject({ name: 'Mine', kind: 'review' });
    const { asset } = await stamp.createAsset({
      libraryId: library.id,
      name: 'One',
      source: pdfBytes(),
    });
    expect(asset).toBe(stamp.getAsset(asset.id));
    const updated = await stamp.updateAsset(asset.id, { label: 'Uno' });
    expect(updated.asset.label).toBe('Uno');
    const renamed = await stamp.updateLibrary(library.id, { name: 'Ours' });
    expect(renamed.library.name).toBe('Ours');
    const copy = await stamp.duplicateAsset(asset.id, { label: 'Dos' });
    expect(copy.asset).toMatchObject({ libraryId: library.id, label: 'Dos' });
    const other = await stamp.createLibrary('Other');
    const moved = await stamp.moveAsset(asset.id, { libraryId: other.library.id });
    expect(moved.asset.libraryId).toBe(other.library.id);
    expect(stamp.getAsset(asset.id)).toBeNull();
  });

  it('acts on the document in scope, else the active one', async () => {
    const { stamp, annotation } = placing();
    const { library } = await stamp.importLibrary(pdfBytes());
    const [asset] = stamp.listAssets({ libraryId: library.id });
    const definition = stampPlugin();
    const scoped = definition.inScope!(stamp, 'doc');

    // The active document is 'doc': both read the same arm.
    await scoped.armAsset(asset.id);
    expect(annotation.stamps.arm).toHaveBeenCalledTimes(1);
    expect(scoped.getArmedAsset()?.id).toBe(asset.id);
    expect(stamp.getArmedAsset()?.id).toBe(asset.id);
    expect(stamp.getArmedAsset('elsewhere')).toBeNull();
    expect(scoped.canPlace()).toBe(true);

    // The view fills in its document, and a named one wins.
    const forwarded = vi.fn(async () => ({ annotation: {} as never }));
    const view = definition.inScope!({ ...stamp, placeAsset: forwarded }, 'doc-2');
    await view.placeAsset(asset.id, { page: 0, center: { x: 1, y: 1 } });
    await view.placeAsset(asset.id, { page: 0, center: { x: 1, y: 1 } }, { documentId: 'doc-3' });
    expect(forwarded.mock.calls.map((call) => (call as unknown[])[2])).toEqual([
      { documentId: 'doc-2' },
      { documentId: 'doc-3' },
    ]);
  });

  it('keeps the armed stamp as state, and announces it with the asset', async () => {
    const { stamp } = placing();
    const { library } = await stamp.importLibrary(pdfBytes());
    const [asset] = stamp.listAssets({ libraryId: library.id });
    const events: unknown[] = [];
    stamp.onArmChanged((event) => events.push(event));

    await stamp.armAsset(asset.id);
    // Arming the same stamp again changes nothing.
    await stamp.armAsset(asset.id);
    stamp.disarm();

    expect(events).toEqual([
      { documentId: 'doc', asset },
      { documentId: 'doc', asset: null },
    ]);
    expect(stampState.read(stamp)).toEqual({ armedAsset: null });
  });

  it('places on a page given by its index, and resolves the annotation it made', async () => {
    const { stamp, placed } = placing();
    const { library } = await stamp.importLibrary(pdfBytes());
    const [asset] = stamp.listAssets({ libraryId: library.id });

    const { annotation } = await stamp.placeAsset(asset.id, { page: 1, center: { x: 5, y: 5 } });
    // The annotation plugin resolves the index; the placed record comes back as it made it.
    expect(placed).toEqual([{ page: 1, center: { x: 5, y: 5 } }]);
    expect(annotation.ref).toMatchObject({ objectNumber: 50 });
  });

  it('places on several pages, refuses a page that is not there before placing any', async () => {
    const { stamp, placed, pages } = placing();
    const { library } = await stamp.importLibrary(pdfBytes());
    const [asset] = stamp.listAssets({ libraryId: library.id });

    const result = await stamp.placeAssetOnPages(asset.id, [0, pages[2]], {
      center: { x: 5, y: 5 },
    });
    expect(result.applied.map((annotation) => annotation.ref)).toMatchObject([
      { page: pages[0] },
      { page: pages[2] },
    ]);
    expect(result.failed).toEqual([]);

    placed.length = 0;
    await expect(
      stamp.placeAssetOnPages(asset.id, [0, 7], { center: { x: 5, y: 5 } }),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(placed).toEqual([]);

    const everywhere = await stamp.placeAssetOnPages(asset.id, 'all', { center: { x: 5, y: 5 } });
    expect(everywhere.applied).toHaveLength(3);
  });

  it('refuses to place without annotations:create, and names the permission', async () => {
    const { stamp, annotation } = placing({ canCreate: false });
    const { library } = await stamp.importLibrary(pdfBytes());
    const [asset] = stamp.listAssets({ libraryId: library.id });

    expect(stamp.canPlace()).toBe(false);
    await expect(stamp.armAsset(asset.id)).rejects.toMatchObject({
      code: 'permission-denied',
      permission: 'annotations:create',
    });
    await expect(
      stamp.placeAsset(asset.id, { page: 0, center: { x: 1, y: 1 } }),
    ).rejects.toMatchObject({ code: 'permission-denied', permission: 'annotations:create' });
    expect(annotation.stamps.arm).not.toHaveBeenCalled();
    expect(annotation.stamps.place).not.toHaveBeenCalled();
  });

  it('makes a stamp from annotations only with doc.download', async () => {
    const allowed = placing();
    expect(allowed.stamp.canCreateFromAnnotations()).toBe(true);
    const refs = [{ kind: 'objectNumber' as const, page: toPageRef(2), objectNumber: 9 }];
    const { asset } = await allowed.stamp.createAssetFromAnnotations(1, refs, { label: 'Mine' });
    expect(asset.label).toBe('Mine');

    const refused = placing({ canDownload: false });
    expect(refused.stamp.canCreateFromAnnotations()).toBe(false);
    await expect(
      refused.stamp.createAssetFromAnnotations(1, refs, { label: 'Mine' }),
    ).rejects.toMatchObject({ code: 'permission-denied', permission: 'doc.download' });
    expect(refused.exportAppearance).not.toHaveBeenCalled();
  });

  it('a cancelled verb rejects operation-cancelled and keeps nothing', async () => {
    const { stamp, assetEngine } = placing();
    const { library } = await stamp.createLibrary('Mine');

    // Cancelled before it started.
    const before = new AbortController();
    before.abort();
    await expect(
      stamp.createAsset(
        { libraryId: library.id, name: 'One', source: pdfBytes() },
        { signal: before.signal },
      ),
    ).rejects.toMatchObject({ code: 'operation-cancelled' });

    // Cancelled while the library is rewritten: the rewrite is dropped.
    const during = new AbortController();
    assetEngine.download.mockImplementationOnce(async () => {
      during.abort();
      return new TextEncoder().encode('%PDF-dropped');
    });
    await expect(
      stamp.createAsset(
        { libraryId: library.id, name: 'Two', source: pdfBytes() },
        { signal: during.signal },
      ),
    ).rejects.toMatchObject({ code: 'operation-cancelled' });
    expect(stamp.listAssets({ libraryId: library.id })).toEqual([]);
    expect(new TextDecoder().decode(await stamp.exportLibrary(library.id))).not.toBe(
      '%PDF-dropped',
    );
  });

  it('has live settings: a change applies to the next thumbnail and to every document', async () => {
    const { stamp, assetEngine } = placing();
    expect(stamp.getSettings()).toEqual(STAMP_DEFAULTS);
    const changes: unknown[] = [];
    stamp.onSettingsChanged((event) => changes.push(event.changed));

    stamp.updateSettings({ previewWidth: 64 });
    expect(stamp.getSettings().previewWidth).toBe(64);
    expect(changes).toEqual([['previewWidth']]);
    stamp.resetSettings();
    expect(stamp.getSettings()).toEqual(STAMP_DEFAULTS);

    // An engine is replaced whole, never merged into.
    stamp.updateSettings({ assetEngine: assetEngine.engine });
    expect(stamp.getSettings().assetEngine).toBe(assetEngine.engine);
  });
});
