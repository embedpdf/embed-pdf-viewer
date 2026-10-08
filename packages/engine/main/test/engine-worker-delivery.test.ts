/**
 * Which worker `localEngine()` starts, and what it tells it about the wasm. By default the
 * bundled `workers/embedpdf-worker.js`, as a module worker from the app's own origin; from a
 * blob: URL where the scripts are on another origin than the page; a configured URL as given.
 * Under Trusted Types every URL goes through the `embedpdf` policy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => ({ engine: null as string | null }));

// Stands in for the bundler: the file it emitted, or none a worker could start from.
vi.mock('../src/worker-files', async () => {
  const { allowWorkerUrl } = await import('../src/trusted-types');
  return {
    findEngineWorkerFile: () => {
      if (files.engine !== null) allowWorkerUrl(files.engine);
      return files.engine;
    },
    findEncoderWorkerFile: () => null,
  };
});
vi.mock('@embedpdf/engine/worker-source', () => ({ default: 'self.onmessage = null;' }));
vi.mock('@embedpdf/engine-runtime-wasm32/wasm-url', () => ({
  default: 'https://app.test/assets/embedpdf-abc.wasm',
}));

import { localEngine } from '../src/index';
import { localEngine as portableLocalEngine } from '../src/portable';

const BUNDLED_FILE = 'https://app.test/assets/embedpdf-worker-abc.js';

/** Records how it was started and the init it got; answers `ready`, or fails to start. */
class FakeWorker {
  static started: FakeWorker[] = [];
  static failToStart = false;
  init: { kind: string; wasmUrl?: string } | null = null;
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
  postMessage(message: { kind: string; wasmUrl?: string }): void {
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
  await vi.waitFor(() => expect(FakeWorker.started).toHaveLength(1));
  await vi.waitFor(() => expect(FakeWorker.started[0].init).not.toBeNull());
  return FakeWorker.started[0];
}

beforeEach(() => {
  // A page's policy is decided once; each test is a fresh page.
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('@embedpdf/engine/trusted-types')];
  FakeWorker.started = [];
  FakeWorker.failToStart = false;
  files.engine = BUNDLED_FILE;
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('location', { origin: 'https://app.test', href: 'https://app.test/viewer' });
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

  it('names the bundled file and the fixes when it never starts', async () => {
    FakeWorker.failToStart = true;
    const engine = localEngine();
    await expect(engine.fonts.clearFallbacks()).rejects.toThrow(
      /did not start from https:\/\/app\.test\/assets\/embedpdf-worker-abc\.js.*@embedpdf\/engine\/portable/,
    );
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
