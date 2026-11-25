/**
 * Which worker `localEngine()` starts, and what it tells it about the wasm. By default the
 * bundled `workers/embedpdf-worker.js`, as a module worker from the app's own origin; from a
 * blob: URL where the scripts are on another origin than the page, or a dev server prebundled
 * the package without its files; a configured URL as given. Under Trusted Types every URL goes
 * through the `embedpdf` policy.
 */
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => ({ engine: null as string | null, prebundled: false }));

// Stands in for the bundler: the file it emitted, or none a worker could start from.
vi.mock('../src/worker-files', async () => {
  const { allowWorkerUrl } = await import('../src/trusted-types');
  return {
    findEngineWorkerFile: () => {
      if (files.engine !== null) allowWorkerUrl(files.engine);
      return files.engine;
    },
    findEncoderWorkerFile: () => null,
    // The dev copy of the wasm, which only a prebundled package in a dev build has.
    prebundledDevWasm: async () =>
      files.prebundled ? gzipSync(DEV_WASM).toString('base64') : null,
  };
});
vi.mock('@embedpdf/engine/worker-source', () => ({ default: 'self.onmessage = null;' }));
vi.mock('@embedpdf/engine-runtime-wasm32/wasm-url', () => ({
  default: 'https://app.test/assets/embedpdf-abc.wasm',
}));

import { localEngine } from '../src/index';
import { localEngine as portableLocalEngine } from '../src/portable';

const BUNDLED_FILE = 'https://app.test/assets/embedpdf-worker-abc.js';
/** The dev copy of the wasm, unpacked. */
const DEV_WASM = vi.hoisted(() => new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));

/** Records how it was started and the init it got; answers `ready`, or fails to start. */
class FakeWorker {
  static started: FakeWorker[] = [];
  static failToStart = false;
  init: {
    kind: string;
    wasmUrl?: string;
    wasmBinary?: ArrayBuffer;
    wasmPort?: MessagePort;
  } | null = null;
  /** What a wasm compile worker was asked to compile (it gets `{ url, port }`, never an init). */
  compile: { url: string; port: MessagePort } | null = null;
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(
    readonly url: unknown,
    readonly options?: WorkerOptions,
  ) {
    FakeWorker.started.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  postMessage(message: {
    kind: string;
    wasmUrl?: string;
    wasmBinary?: ArrayBuffer;
    wasmPort?: MessagePort;
    jobId?: unknown;
    url?: string;
    port?: MessagePort;
  }): void {
    if (message.port !== undefined) {
      this.compile = { url: message.url!, port: message.port };
      return;
    }
    if (message.jobId !== undefined) {
      // A job (the boot registers the default fallback fonts): done.
      const answer = { kind: 'resolve', jobId: message.jobId, result: { tag: message.kind } };
      queueMicrotask(() => this.emit('message', { data: answer }));
      return;
    }
    if (message.kind !== 'init') return;
    this.init = message;
    queueMicrotask(() => {
      if (FakeWorker.failToStart) this.emit('error', { message: '' });
      else this.emit('message', { data: { kind: 'ready' } });
    });
  }
  terminate(): void {}

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

/** Boots the engine and returns the worker it started. */
async function bootedWorker(engine: ReturnType<typeof localEngine>): Promise<FakeWorker> {
  engine.warmup();
  await vi.waitFor(() => expect(engineWorkers()).toHaveLength(1));
  await vi.waitFor(() => expect(engineWorkers()[0].init).not.toBeNull());
  return engineWorkers()[0];
}

/** The workers started, less the wasm compile worker. */
function engineWorkers(): FakeWorker[] {
  return FakeWorker.started.filter((worker) => worker.compile === null);
}

function compileWorkers(): FakeWorker[] {
  return FakeWorker.started.filter((worker) => worker.compile !== null);
}

beforeEach(() => {
  // A page's policy is decided once; each test is a fresh page.
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('@embedpdf/engine/trusted-types')];
  FakeWorker.started = [];
  FakeWorker.failToStart = false;
  files.engine = BUNDLED_FILE;
  files.prebundled = false;
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('location', { origin: 'https://app.test', href: 'https://app.test/viewer' });
  // No network here: the page-side wasm compile fails, so the worker gets the URL.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('offline');
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("localEngine()'s worker", () => {
  it('is the bundled file, as a module worker, told where the bundler put the wasm', async () => {
    const engine = localEngine();
    const worker = await bootedWorker(engine);

    expect(worker.url).toBe(BUNDLED_FILE);
    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.init?.wasmUrl).toBe('https://app.test/assets/embedpdf-abc.wasm');
    await engine.destroy();
  });

  it('starts from a blob: URL where the bundled file is on another origin than the page', async () => {
    files.engine = null;
    const engine = localEngine();
    const worker = await bootedWorker(engine);

    expect(String(worker.url).startsWith('blob:')).toBe(true);
    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.init?.wasmUrl).toBe('https://app.test/assets/embedpdf-abc.wasm');
    await engine.destroy();
  });

  it('starts from a blob: URL with the inline wasm where a dev server prebundled the package', async () => {
    // What `findEngineWorkerFile` answers there: the file was left behind.
    files.engine = null;
    files.prebundled = true;
    const engine = localEngine();
    const worker = await bootedWorker(engine);

    expect(String(worker.url).startsWith('blob:')).toBe(true);
    expect(worker.init?.wasmUrl).toBeUndefined();
    expect(new Uint8Array(worker.init!.wasmBinary!)).toEqual(DEV_WASM);
    await engine.destroy();
  });

  it('is a configured URL as given, which finds its wasm as its own sibling', async () => {
    const engine = localEngine({ worker: '/vendor/embedpdf/embedpdf-worker.js' });
    const worker = await bootedWorker(engine);

    expect(worker.url).toBe('https://app.test/vendor/embedpdf/embedpdf-worker.js');
    expect(worker.init?.wasmUrl).toBeUndefined();
    await engine.destroy();
  });

  it('goes through the embedpdf Trusted Types policy', async () => {
    const policies: string[] = [];
    vi.stubGlobal('trustedTypes', {
      createPolicy: (name: string, rules: { createScriptURL: (url: string) => string }) => {
        policies.push(name);
        return { createScriptURL: (url: string) => ({ trusted: rules.createScriptURL(url) }) };
      },
    });
    const engine = localEngine();
    const worker = await bootedWorker(engine);

    expect(worker.url).toEqual({ trusted: BUNDLED_FILE });
    expect(policies.every((name) => name === 'embedpdf')).toBe(true);
    await engine.destroy();
  });

  it('names the bundled file and the fixes when it never starts, in the console too', async () => {
    FakeWorker.failToStart = true;
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = localEngine();
    const failure =
      /did not start from https:\/\/app\.test\/assets\/embedpdf-worker-abc\.js.*@embedpdf\/engine\/portable/;
    await expect(engine.fonts.clearFallbacks()).rejects.toThrow(failure);

    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith(
      '[embedpdf]',
      expect.objectContaining({ message: expect.stringMatching(failure) }),
    );
    reported.mockRestore();
    await engine.destroy();
  });

  it('names a configured URL when no worker starts from it', async () => {
    FakeWorker.failToStart = true;
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = localEngine({ worker: '/vendor/embedpdf/embedpdf-worker.js' });
    const failure =
      /did not start from https:\/\/app\.test\/vendor\/embedpdf\/embedpdf-worker\.js, the `worker` URL/;
    await expect(engine.fonts.clearFallbacks()).rejects.toThrow(failure);

    expect(reported).toHaveBeenCalledWith(
      '[embedpdf]',
      expect.objectContaining({ message: expect.stringMatching(failure) }),
    );
    reported.mockRestore();
    await engine.destroy();
  });

  it('is a blob: worker from @embedpdf/engine/portable, whose toolchains emit no worker file', async () => {
    const engine = portableLocalEngine({ wasmUrl: 'https://app.test/embedpdf.wasm' });
    const worker = await bootedWorker(engine);

    expect(String(worker.url).startsWith('blob:')).toBe(true);
    expect(worker.init?.wasmUrl).toBe('https://app.test/embedpdf.wasm');
    await engine.destroy();
  });
});

describe('the wasm compile', () => {
  it('runs in a worker of its own while the engine worker loads; the module goes to it over a port', async () => {
    const engine = localEngine();
    const worker = await bootedWorker(engine);

    expect(compileWorkers()).toHaveLength(1);
    const compiler = compileWorkers()[0];
    expect(String(compiler.url).startsWith('blob:')).toBe(true);
    expect(compiler.compile?.url).toBe('https://app.test/assets/embedpdf-abc.wasm');
    expect(worker.init?.wasmPort).toBeDefined();
    expect(worker.init?.wasmUrl).toBe('https://app.test/assets/embedpdf-abc.wasm');
    await engine.destroy();
  });

  it('is left to the engine worker, from the URL, when the compile worker cannot start', async () => {
    const Original = FakeWorker;
    vi.stubGlobal(
      'Worker',
      class extends Original {
        constructor(url: unknown, options?: WorkerOptions) {
          if (String(url).startsWith('blob:')) throw new Error('worker-src');
          super(url, options);
        }
      },
    );
    const engine = localEngine();
    const worker = await bootedWorker(engine);

    expect(compileWorkers()).toHaveLength(0);
    expect(worker.init?.wasmPort).toBeUndefined();
    expect(worker.init?.wasmUrl).toBe('https://app.test/assets/embedpdf-abc.wasm');
    await engine.destroy();
  });

  it('is not started for caller-supplied bytes', async () => {
    const compileStreaming = vi.fn();
    vi.stubGlobal('WebAssembly', { ...WebAssembly, compileStreaming });
    const engine = localEngine({ wasmBinary: new Uint8Array(DEV_WASM) });
    const worker = await bootedWorker(engine);

    expect(compileStreaming).not.toHaveBeenCalled();
    expect(compileWorkers()).toHaveLength(0);
    expect(worker.init?.wasmPort).toBeUndefined();
    expect(worker.init?.wasmBinary).toBeInstanceOf(ArrayBuffer);
    await engine.destroy();
  });
});
