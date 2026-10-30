import type { DocumentHandle, Engine } from '@embedpdf/engine-core/runtime';
import { LOCAL_ENGINE_BRAND } from '@embedpdf/engine-core/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { documentState, documentsState } from '../src/documents-state';
import { isPluginError } from '../src/errors';
import { createKernel } from '../src/kernel';
import { DocumentsToken, type AnyPlugin, type PluginContext } from '../src/types';
import { bytesInput, immediateEngine, makeHandle, quietPrinter, settle } from './helpers';

/**
 * The documents capability as the Opening, Several documents and Saving pages describe it: what
 * `open()` resolves, the document's fields, unsaved changes, downloading and the checks before it,
 * a URL source, and the viewer's own scope and identity.
 */

/** A local document whose events the test sends, and whose download it controls. */
function localHandle(id: string, allows: (permission: string) => boolean = () => true) {
  const handle = makeHandle(id) as DocumentHandle & {
    events: { emit(event: unknown): void };
  };
  return Object.assign(handle, {
    [LOCAL_ENGINE_BRAND]: true,
    security: { allows },
    download: vi.fn(async () => new Uint8Array([1])),
    downloadLayer: vi.fn(async () => new Uint8Array([2])),
  });
}

const change = { type: 'metadata.updated', origin: { kind: 'local' } };

/** The start of a PDF, which is all a download has to be for the viewer to open it. */
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n');

/** A server's answer with {@link PDF_BYTES}. */
const pdfResponse = () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => PDF_BYTES.slice().buffer,
});

async function openLocal(handle: ReturnType<typeof localHandle>, plugins: AnyPlugin[] = []) {
  const kernel = createKernel({
    engine: immediateEngine({ [handle.id]: handle }),
    plugins,
    printer: quietPrinter(),
  });
  await kernel.start();
  await kernel.documents.open(bytesInput(handle.id));
  return kernel;
}

afterEach(() => vi.unstubAllGlobals());

describe('open()', () => {
  it('resolves the document, ready, as get() reads it', async () => {
    const kernel = createKernel({ engine: immediateEngine(), plugins: [] });
    const { document } = await kernel.documents.open(bytesInput('a'), { name: 'Contract' });
    expect(document).toEqual({
      id: 'a',
      name: 'Contract',
      status: 'ready',
      pageCount: 1,
      hasUnsavedChanges: false,
    });
    expect(kernel.documents.get('a')).toBe(document);
    expect(kernel.documents.get()).toBe(document); // the active document without an id
  });

  it('a signal that fires while it opens closes the document', async () => {
    let finish!: (handle: DocumentHandle) => void;
    const engine = {
      open: () => new Promise<DocumentHandle>((resolve) => (finish = resolve)),
      destroy: async () => {},
    } as unknown as Engine;
    const kernel = createKernel({ engine, plugins: [] });
    const cancel = new AbortController();
    const opening = kernel.documents.open(bytesInput('a'), { signal: cancel.signal });
    expect(kernel.documents.has('a')).toBe(true);
    cancel.abort();
    await expect(opening).rejects.toSatisfy((error) => isPluginError(error, 'operation-cancelled'));
    expect(kernel.documents.has('a')).toBe(false);
    finish(makeHandle('a')); // a late handle is closed, never published
  });

  it('a signal that already fired rejects without a tab', async () => {
    const kernel = createKernel({ engine: immediateEngine(), plugins: [] });
    const cancel = new AbortController();
    cancel.abort();
    await expect(
      kernel.documents.open(bytesInput('a'), { signal: cancel.signal }),
    ).rejects.toMatchObject({ code: 'operation-cancelled' });
    expect(kernel.documents.getCount()).toBe(0);
  });

  it('a URL source is downloaded under its loading tab, with the document’s signal', async () => {
    const fetch = vi.fn(async (_url: string, _init: { signal: AbortSignal }) => pdfResponse());
    vi.stubGlobal('fetch', fetch);
    const open = vi.fn(async () => makeHandle('doc-1'));
    const kernel = createKernel({
      engine: { open, destroy: async () => {} } as unknown as Engine,
      plugins: [],
    });
    const { document } = await kernel.documents.open({ kind: 'url', url: '/files/contract.pdf' });
    expect(fetch).toHaveBeenCalledWith('/files/contract.pdf', {
      signal: expect.any(AbortSignal),
    });
    expect(open).toHaveBeenCalledWith({ kind: 'bytes', bytes: PDF_BYTES }, expect.anything());
    expect(document.status).toBe('ready');
  });

  it('the host’s fetch downloads it instead, as a plain function, under the id the source names', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('the global fetch is not the one to call');
    });
    const calls: { url: string; init: { signal: AbortSignal }; self: unknown }[] = [];
    // The browser's own fetch throws "Illegal invocation" when called on anything but the page.
    function hostFetch(this: unknown, url: string, init: { readonly signal: AbortSignal }) {
      calls.push({ url, init, self: this });
      return Promise.resolve(pdfResponse());
    }
    const open = vi.fn(async (input: { id: string }) => makeHandle(input.id));
    const kernel = createKernel({
      engine: { open, destroy: async () => {} } as unknown as Engine,
      plugins: [],
      fetch: hostFetch,
    });
    const { document } = await kernel.documents.open({
      kind: 'url',
      url: '/files/contract.pdf',
      id: 'contract',
    });
    expect(calls).toEqual([
      { url: '/files/contract.pdf', init: { signal: expect.any(AbortSignal) }, self: undefined },
    ]);
    expect(open).toHaveBeenCalledWith(
      { kind: 'bytes', id: 'contract', bytes: PDF_BYTES },
      expect.anything(),
    );
    expect(document.id).toBe('contract');
  });

  it('a URL the user may not have shows as not allowed, and retry() asks the host’s fetch again', async () => {
    let token: string | null = null;
    const fetch = vi.fn(async () =>
      token
        ? pdfResponse()
        : { ok: false, status: 401, arrayBuffer: async () => new ArrayBuffer(0) },
    );
    const kernel = createKernel({ engine: immediateEngine(), plugins: [], fetch });
    await expect(
      kernel.documents.open({ kind: 'url', url: '/private.pdf', id: 'private' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(kernel.documents.get('private')).toMatchObject({
      status: 'error',
      error: { code: 'permission-denied', message: expect.stringContaining('HTTP 401') },
    });
    token = 'signed-in';
    const { document } = await kernel.documents.retry('private');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(document).toMatchObject({ id: 'private', status: 'ready' });
  });

  it('a URL that answers with something other than a PDF shows as the tab’s error', async () => {
    const page = new TextEncoder().encode('<!doctype html><title>Sign in</title>');
    const fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => page.buffer });
    const open = vi.fn();
    const kernel = createKernel({
      engine: { open, destroy: async () => {} } as unknown as Engine,
      plugins: [],
      fetch,
    });
    await expect(kernel.documents.open({ kind: 'url', url: '/sign-in' })).rejects.toMatchObject({
      code: 'invalid-input',
      message: expect.stringContaining("/sign-in isn't a PDF"),
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('a URL the server refuses shows as the tab’s error', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, arrayBuffer: async () => null }));
    const kernel = createKernel({ engine: immediateEngine(), plugins: [] });
    await expect(kernel.documents.open({ kind: 'url', url: '/missing.pdf' })).rejects.toMatchObject(
      { code: 'not-found' },
    );
    expect(kernel.documents.list()[0]).toMatchObject({
      status: 'error',
      error: { code: 'not-found', message: expect.stringContaining('/missing.pdf') },
    });
  });

  it('closing the tab stops the download of a URL source', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return new Promise(() => {});
    });
    const kernel = createKernel({ engine: immediateEngine(), plugins: [] });
    const opening = kernel.documents.open({ kind: 'url', url: '/slow.pdf' });
    await settle();
    const [{ id }] = kernel.documents.list();
    await kernel.documents.close(id);
    expect(signal?.aborted).toBe(true);
    await expect(opening).rejects.toMatchObject({ code: 'operation-cancelled' });
  });
});

describe('canOpenFiles()', () => {
  it('is true with an engine that opens a file’s bytes, in a document’s scope too', async () => {
    const kernel = createKernel({ engine: immediateEngine(), plugins: [] });
    expect(kernel.documents.canOpenFiles()).toBe(true);
    await kernel.documents.open(bytesInput('a'));
    expect(kernel.capability(DocumentsToken, 'a').canOpenFiles()).toBe(true);
  });

  it('is false with an engine that opens only what a server holds, whose open() refuses a file', async () => {
    // The cloud engine's answer to bytes.
    const open = vi.fn(async () => {
      throw new Error("the engine opens 'token', 'id' or 'share'");
    });
    const engine = { canOpenFiles: false, open, destroy: async () => {} } as unknown as Engine;
    const kernel = createKernel({ engine, plugins: [] });
    expect(kernel.documents.canOpenFiles()).toBe(false);
    await expect(kernel.documents.open(bytesInput('a'))).rejects.toBeDefined();
    expect(kernel.documents.get('a')?.status).toBe('error');
  });
});

describe('the viewer’s scope and identity', () => {
  it('every document opens with them, unless it has its own, which replace them', async () => {
    const open = vi.fn(async (input: { id: string }, _options?: object) => makeHandle(input.id));
    const kernel = createKernel({
      engine: { open, destroy: async () => {} } as unknown as Engine,
      plugins: [],
      settings: { identity: { userId: 'u1', displayName: 'Dana' }, scope: ['doc.open'] },
    });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'), { scope: ['doc.render'], identity: {} });
    expect(open.mock.calls[0][1]).toEqual({
      scope: ['doc.open'],
      identity: { userId: 'u1', displayName: 'Dana' },
    });
    expect(open.mock.calls[1][1]).toEqual({ scope: ['doc.render'], identity: {} });
  });

  it('a change reaches the documents opened after it; an identity is replaced whole', async () => {
    const open = vi.fn(async (input: { id: string }, _options?: object) => makeHandle(input.id));
    const kernel = createKernel({
      engine: { open, destroy: async () => {} } as unknown as Engine,
      plugins: [],
      settings: { identity: { userId: 'u1', displayName: 'Dana' } },
    });
    kernel.updateSettings({ identity: { userId: 'u2' }, accent: '#e91e63' });
    expect(kernel.getSettings()).toMatchObject({ identity: { userId: 'u2' }, accent: '#e91e63' });
    await kernel.documents.open(bytesInput('a'));
    expect(open.mock.calls[0][1]).toEqual({ identity: { userId: 'u2' } });
    kernel.resetSettings();
    expect(kernel.getSettings().identity).toEqual({ userId: 'u1', displayName: 'Dana' });
    expect(kernel.getSettings().page.shadow).toBe('0 6px 18px rgb(0 0 0 / 0.18)');
  });
});

describe('unsaved changes', () => {
  it('a change to a local document sets hasUnsavedChanges once, and a download clears it', async () => {
    const handle = localHandle('a');
    const kernel = await openLocal(handle);
    const flips: boolean[] = [];
    kernel.documents.onUnsavedChangesChanged((event) => {
      expect(event.documentId).toBe('a');
      flips.push(event.hasUnsavedChanges);
    });
    const before = kernel.documents.get('a');
    handle.events.emit(change);
    handle.events.emit(change);
    expect(kernel.documents.get('a')?.hasUnsavedChanges).toBe(true);
    expect(kernel.documents.get('a')).not.toBe(before);

    await kernel.documents.download('a');
    expect(kernel.documents.get('a')?.hasUnsavedChanges).toBe(false);
    expect(flips).toEqual([true, false]);
  });

  it('a change while the file is read keeps the document unsaved', async () => {
    const handle = localHandle('a');
    handle.download.mockImplementation(async () => {
      handle.events.emit(change);
      return new Uint8Array([1]);
    });
    const kernel = await openLocal(handle);
    handle.events.emit(change);
    await kernel.documents.download('a');
    expect(kernel.documents.get('a')?.hasUnsavedChanges).toBe(true);
  });

  it('stays false where every change is stored as it is made (the cloud engine)', async () => {
    const handle = makeHandle('a') as DocumentHandle & { events: { emit(event: unknown): void } };
    const kernel = createKernel({ engine: immediateEngine({ a: handle }), plugins: [] });
    await kernel.documents.open(bytesInput('a'));
    handle.events.emit(change);
    expect(kernel.documents.get('a')?.hasUnsavedChanges).toBe(false);
  });

  it('a notice is not a change: a signature waiting for its seal changes nothing yet', async () => {
    const handle = localHandle('a');
    const kernel = await openLocal(handle);
    handle.events.emit({ type: 'signatures.prepared', origin: { kind: 'local' } });
    handle.events.emit({ type: 'stream.desynced', reason: 'backlog-overflow', ts: 0 });
    expect(kernel.documents.get('a')?.hasUnsavedChanges).toBe(false);
  });
});

describe('download()', () => {
  it('refuses without doc.download before anything runs, and canDownload() says so', async () => {
    const flush = vi.fn();
    const plugin: AnyPlugin = {
      id: 'holder',
      scope: 'document',
      create: (ctx: PluginContext<unknown>) => (ctx.onSettle(flush), { api: {} }),
    };
    const handle = localHandle('a', (permission) => permission !== 'doc.download');
    const kernel = await openLocal(handle, [plugin]);
    expect(kernel.documents.canDownload()).toBe(false);
    expect(kernel.documents.canPrint()).toBe(true);
    const refused = await kernel.documents.download().catch((error: unknown) => error);
    expect(refused).toMatchObject({ code: 'permission-denied', permission: 'doc.download' });
    await expect(kernel.documents.downloadLayer()).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(flush).not.toHaveBeenCalled();
    expect(handle.download).not.toHaveBeenCalled();
  });

  it('runs what a plugin registered around the read, the first registered outermost', async () => {
    const log: string[] = [];
    const wrapping = (name: string): AnyPlugin => ({
      id: name,
      scope: 'document',
      create: (ctx: PluginContext<unknown>) => {
        ctx.aroundDownload(async (read) => {
          log.push(`${name}:before`);
          const bytes = await read();
          log.push(`${name}:after`);
          return bytes;
        });
        return { api: {} };
      },
    });
    const handle = localHandle('a');
    handle.download.mockImplementation(async () => {
      log.push('read');
      return new Uint8Array([7]);
    });
    handle.downloadLayer.mockImplementation(async () => {
      log.push('read layer');
      return new Uint8Array([8]);
    });
    const kernel = await openLocal(handle, [wrapping('outer'), wrapping('inner')]);
    expect(await kernel.documents.download()).toEqual(new Uint8Array([7]));
    expect(log).toEqual(['outer:before', 'inner:before', 'read', 'inner:after', 'outer:after']);
    log.length = 0;
    expect(await kernel.documents.downloadLayer()).toEqual(new Uint8Array([8]));
    expect(log).toEqual([
      'outer:before',
      'inner:before',
      'read layer',
      'inner:after',
      'outer:after',
    ]);
  });

  it('passes the mode, and a signal cancels it', async () => {
    const handle = localHandle('a');
    const kernel = await openLocal(handle);
    await kernel.documents.download(undefined, { mode: 'rewrite' });
    expect(handle.download).toHaveBeenCalledWith({ mode: 'rewrite' });

    handle.download.mockImplementation(() => new Promise(() => {}));
    const cancel = new AbortController();
    const downloading = kernel.documents.download('a', { signal: cancel.signal });
    await settle();
    cancel.abort();
    await expect(downloading).rejects.toMatchObject({ code: 'operation-cancelled' });
  });

  it('downloadLayer() refuses a document from an engine that keeps layers itself', async () => {
    const handle = makeHandle('a');
    const kernel = createKernel({ engine: immediateEngine({ a: handle }), plugins: [] });
    await kernel.documents.open(bytesInput('a'));
    await expect(kernel.documents.downloadLayer()).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('rejects not-ready with no document open', async () => {
    const kernel = createKernel({ engine: immediateEngine(), plugins: [] });
    await expect(kernel.documents.download()).rejects.toMatchObject({ code: 'not-ready' });
  });
});

describe('unlock()', () => {
  it('a signal stops trying the password, and the document stays locked', async () => {
    const handle = Object.assign(makeHandle('a'), {
      security: {
        allows: () => true,
        passwordPrompt: { state: 'required', incorrect: false },
        unlock: () => new Promise(() => {}),
      },
    });
    const kernel = createKernel({ engine: immediateEngine({ a: handle }), plugins: [] });
    const { document } = await kernel.documents.open(bytesInput('a'));
    expect(document).toMatchObject({ status: 'locked', passwordProvided: false });
    const cancel = new AbortController();
    const unlocking = kernel.documents.unlock('a', { password: 'pw', signal: cancel.signal });
    cancel.abort();
    await expect(unlocking).rejects.toMatchObject({ code: 'operation-cancelled' });
    expect(kernel.documents.get('a')?.status).toBe('locked');
    await expect(kernel.documents.unlock('b', { password: 'pw' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
  });
});

describe('the State tables', () => {
  it('useDocument() reads the document in scope, and an empty one without any', async () => {
    const kernel = createKernel({ engine: immediateEngine(), plugins: [] });
    expect(documentState.read(kernel.documents)).toBe(documentState.empty);
    expect(documentState.empty).toMatchObject({ id: '', status: 'loading', pageCount: 0 });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    expect(documentState.read(kernel.documents).id).toBe('b');
    expect(documentState.read(kernel.capability(DocumentsToken, 'a')).id).toBe('a');
  });

  it('useDocumentsState() keeps every document’s object while only another changed', async () => {
    const kernel = createKernel({ engine: immediateEngine(), plugins: [] });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    const before = documentsState.read(kernel.documents);
    expect(before.activeId).toBe('b');
    kernel.documents.setActive('a');
    const after = documentsState.read(kernel.documents);
    expect(after.documents).toBe(before.documents); // the active document isn't in the list
    kernel.documents.rename('b', 'Renamed');
    const renamed = documentsState.read(kernel.documents).documents;
    expect(renamed).not.toBe(before.documents);
    expect(renamed[0]).toBe(before.documents[0]);
    expect(renamed[1].name).toBe('Renamed');
  });
});
