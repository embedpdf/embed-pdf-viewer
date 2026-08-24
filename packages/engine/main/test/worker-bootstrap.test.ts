/**
 * The fallback discipline of the worker boot: only a FAILED FETCH of the
 * bundler-default wasm may reach for the CDN. Compile/init failures surface
 * directly — retrying another copy of the same binary would mask them.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { startEngineWorker, type EngineWorkerInit } from '../src/worker/bootstrap';

vi.mock('@embedpdf/engine-runtime', () => ({ createPdfRuntime: vi.fn() }));
vi.mock('@embedpdf/engine-services', () => ({
  WorkerHost: class {
    receive(): void {}
  },
}));

import { createPdfRuntime } from '@embedpdf/engine-runtime';

const createRuntimeMock = vi.mocked(createPdfRuntime);

/** Minimal DedicatedWorkerGlobalScope double: init in, handshake out. */
function makeScope() {
  const posted: Array<Record<string, unknown>> = [];
  const scope = {
    onmessage: null as ((e: { data: unknown }) => void) | null,
    postMessage: (msg: unknown) => {
      posted.push(msg as Record<string, unknown>);
    },
  };
  startEngineWorker(scope as unknown as DedicatedWorkerGlobalScope);
  const init = (msg: EngineWorkerInit) => scope.onmessage!({ data: msg });
  const settled = () =>
    vi.waitFor(() => {
      if (posted.length === 0) throw new Error('no handshake yet');
    });
  return { posted, init, settled };
}

const okResponse = (bytes = 8) =>
  ({ ok: true, arrayBuffer: async () => new ArrayBuffer(bytes) }) as unknown as Response;
const notFound = () => ({ ok: false, status: 404 }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createRuntimeMock.mockReset();
  createRuntimeMock.mockResolvedValue({} as never);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('engine worker boot — wasm source handling', () => {
  test('explicit source (no fallback): the URL goes straight to the runtime, nothing is fetched here', async () => {
    const { posted, init, settled } = makeScope();
    init({ kind: 'init', wasmUrl: 'https://self.host/embedpdf.wasm' });
    await settled();

    expect(posted[0]).toEqual({ kind: 'ready' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createRuntimeMock).toHaveBeenCalledWith({
      prefer: 'wasm',
      wasmUrl: 'https://self.host/embedpdf.wasm',
      wasmBinary: undefined,
    });
  });

  test('default source, primary fetch succeeds: bytes reach the runtime, no warning, no CDN traffic', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const { posted, init, settled } = makeScope();
    init({
      kind: 'init',
      wasmUrl: 'https://app.example/assets/embedpdf.wasm',
      fallbackWasmUrl: 'https://cdn.example/embedpdf.wasm',
    });
    await settled();

    expect(posted[0]).toEqual({ kind: 'ready' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://app.example/assets/embedpdf.wasm');
    expect(warnSpy).not.toHaveBeenCalled();
    const opts = createRuntimeMock.mock.calls[0][0]!;
    expect(opts.wasmBinary).toBeInstanceOf(ArrayBuffer);
    expect(opts.wasmUrl).toBeUndefined();
  });

  test('primary fetch fails: warns once BEFORE the CDN request, then boots from the fallback', async () => {
    const order: string[] = [];
    warnSpy.mockImplementation(() => {
      order.push('warn');
    });
    fetchMock.mockImplementation(async (url: string) => {
      order.push(`fetch:${url}`);
      return url === 'https://app.example/missing.wasm' ? notFound() : okResponse();
    });

    const { posted, init, settled } = makeScope();
    init({
      kind: 'init',
      wasmUrl: 'https://app.example/missing.wasm',
      fallbackWasmUrl: 'https://cdn.example/embedpdf.wasm',
    });
    await settled();

    expect(posted[0]).toEqual({ kind: 'ready' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('https://app.example/missing.wasm');
    expect(order).toEqual([
      'fetch:https://app.example/missing.wasm',
      'warn',
      'fetch:https://cdn.example/embedpdf.wasm',
    ]);
  });

  test('both fetches fail: init-error carries both URLs and both failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(notFound());

    const { posted, init, settled } = makeScope();
    init({
      kind: 'init',
      wasmUrl: 'https://app.example/missing.wasm',
      fallbackWasmUrl: 'https://cdn.example/embedpdf.wasm',
    });
    await settled();

    expect(posted[0].kind).toBe('init-error');
    const error = String(posted[0].error);
    expect(error).toContain('https://app.example/missing.wasm');
    expect(error).toContain('ECONNREFUSED');
    expect(error).toContain('https://cdn.example/embedpdf.wasm');
    expect(error).toContain('HTTP 404');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test('a failure AFTER bytes-in-hand (compile/init) is never retried against the CDN', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    createRuntimeMock.mockRejectedValueOnce(new Error('CompileError: invalid wasm'));

    const { posted, init, settled } = makeScope();
    init({
      kind: 'init',
      wasmUrl: 'https://app.example/assets/embedpdf.wasm',
      fallbackWasmUrl: 'https://cdn.example/embedpdf.wasm',
    });
    await settled();

    expect(posted[0].kind).toBe('init-error');
    expect(String(posted[0].error)).toContain('CompileError');
    // One fetch, no warning: the CDN was never contacted for a non-fetch failure.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('caller-supplied wasmBinary bypasses fetching entirely, fallback or not', async () => {
    const { posted, init, settled } = makeScope();
    const bytes = new ArrayBuffer(4);
    init({
      kind: 'init',
      wasmUrl: 'https://app.example/assets/embedpdf.wasm',
      fallbackWasmUrl: 'https://cdn.example/embedpdf.wasm',
      wasmBinary: bytes,
    });
    await settled();

    expect(posted[0]).toEqual({ kind: 'ready' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createRuntimeMock.mock.calls[0][0]!.wasmBinary).toBe(bytes);
  });
});
