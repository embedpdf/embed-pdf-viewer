/**
 * The worker boot takes exactly what the main thread decided — a URL for the
 * runtime to stream, or bytes — and never fetches or retries on its own: a
 * missing wasm is a build or configuration problem, reported with the fix.
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

  test('a load failure reports the URL and names the portable entry and assetsUrl', async () => {
    createRuntimeMock.mockRejectedValueOnce(new Error('failed to fetch: HTTP 404'));
    const { posted, init, settled } = makeScope();
    init({ kind: 'init', wasmUrl: 'https://app.example/lib/embedpdf.wasm' });
    await settled();

    expect(posted[0].kind).toBe('init-error');
    const error = String(posted[0].error);
    expect(error).toContain('https://app.example/lib/embedpdf.wasm');
    expect(error).toContain('@embedpdf/engine/portable');
    expect(error).toContain('assetsUrl');
    expect(error).toContain('HTTP 404');
    // The worker itself never fetched anything, and never warned about a CDN.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('caller-supplied wasmBinary reaches the runtime as-is', async () => {
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
