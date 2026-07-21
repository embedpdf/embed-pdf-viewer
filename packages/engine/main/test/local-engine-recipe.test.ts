import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WirePack, WorkerResponse } from '@embedpdf/engine-core/runtime';
import { WorkerHost } from '@embedpdf/engine-services';
import { createPdfRuntime } from '@embedpdf/engine-runtime';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { createLocalEngineWithWorker, localEngine } from '../src/index';
import type { WorkerRequest } from '../src/worker/protocol';

const here = dirname(fileURLToPath(import.meta.url));
const robotoPath = resolve(here, 'fixtures', 'Roboto-Regular.ttf');

let roboto: Uint8Array;
beforeAll(async () => {
  roboto = new Uint8Array(await readFile(robotoPath));
});

/**
 * An in-process Web Worker: bridges the small `Worker` surface
 * `BrowserWorkerTransport` needs to a real {@link WorkerHost}, so `localEngine()`
 * boots end-to-end in node without a browser Worker. `spawned` counts how many
 * were created (boot laziness); `terminated` proves teardown; `received`
 * records the request kinds in host arrival order (boot-font ordering).
 */
class FakeWorker {
  static spawned = 0;
  terminated = false;
  /** True once `ready` has been emitted — i.e. the handshake already fired. */
  ready = false;
  readonly received: WorkerRequest[] = [];
  private readonly listeners = new Set<(e: MessageEvent) => void>();
  private host: WorkerHost | null = null;
  private readonly queue: WorkerRequest[] = [];

  constructor() {
    FakeWorker.spawned += 1;
    void this.init();
  }

  private async init(): Promise<void> {
    const runtime = await createPdfRuntime({ prefer: 'wasm' });
    this.host = new WorkerHost(runtime, (pack: WirePack<WorkerResponse>) =>
      this.emit(pack.payload),
    );
    for (const msg of this.queue.splice(0)) this.host.receive(msg);
    this.emit({ kind: 'ready' });
    this.ready = true;
  }

  private emit(data: unknown): void {
    for (const fn of this.listeners) fn({ data } as MessageEvent);
  }

  addEventListener(_type: 'message', fn: (e: MessageEvent) => void): void {
    this.listeners.add(fn);
  }
  removeEventListener(_type: 'message', fn: (e: MessageEvent) => void): void {
    this.listeners.delete(fn);
  }
  postMessage(payload: unknown): void {
    this.received.push(payload as WorkerRequest);
    if (this.host) this.host.receive(payload as WorkerRequest);
    else this.queue.push(payload as WorkerRequest);
  }
  terminate(): void {
    this.terminated = true;
  }
}

const fakeWorker = () => new FakeWorker() as unknown as Worker;

describe('localEngine()', () => {
  afterEach(() => {
    FakeWorker.spawned = 0;
    vi.restoreAllMocks();
  });

  test('constructs synchronously and stays inert — no worker until first use', () => {
    const spawn = vi.fn(fakeWorker);
    const engine = localEngine({ worker: spawn });

    // A real, synchronously usable engine object — including the font service.
    expect(engine.fonts).toBeDefined();
    expect(engine.fonts.list()).toEqual([]);
    expect(spawn).not.toHaveBeenCalled();
    expect(FakeWorker.spawned).toBe(0);
  });

  test('warmup() starts the boot without any work being submitted', async () => {
    const spawn = vi.fn(fakeWorker);
    const engine = localEngine({ worker: spawn });

    engine.warmup();
    expect(spawn).toHaveBeenCalledTimes(1);
    // Idempotent: warming up twice spawns nothing extra.
    engine.warmup();
    expect(spawn).toHaveBeenCalledTimes(1);

    await engine.destroy();
  });

  test('destroy() on a never-used engine resolves without spawning a worker', async () => {
    const spawn = vi.fn(fakeWorker);
    const engine = localEngine({ worker: spawn });
    await engine.destroy();
    expect(spawn).not.toHaveBeenCalled();
  });

  test('the first operation boots the engine, and each localEngine() call is independent', async () => {
    const spawn = vi.fn(fakeWorker);
    const a = localEngine({ worker: spawn });
    const b = localEngine({ worker: spawn });
    expect(spawn).not.toHaveBeenCalled();

    await a.fonts.register({ key: 'r', familyName: 'Roboto', data: roboto });
    expect(spawn).toHaveBeenCalledTimes(1);

    await b.fonts.register({ key: 'r', familyName: 'Roboto', data: roboto });
    expect(spawn).toHaveBeenCalledTimes(2);

    await a.destroy();
    await b.destroy();
  });

  test('registers `fonts` then `fallbackFonts`, preserving declared order', async () => {
    const engine = localEngine({
      worker: fakeWorker,
      fonts: [{ key: 'plain', familyName: 'Roboto', data: roboto }],
      fallbackFonts: [
        { key: 'fb-1', familyName: 'Roboto', data: roboto },
        { key: 'fb-2', familyName: 'Roboto', data: roboto },
      ],
    });

    engine.warmup();
    // Boot completion is observable through any queued job settling.
    await engine.fonts.clearFallbacks();

    // list() reflects registration order: plain `fonts` first, then fallbacks.
    expect(engine.fonts.list().map((f) => f.key)).toEqual(['plain', 'fb-1', 'fb-2']);
    await engine.destroy();
  });

  test('configured fonts reach the worker before any queued user job', async () => {
    let worker!: FakeWorker;
    const engine = localEngine({
      worker: () => {
        worker = new FakeWorker();
        return worker as unknown as Worker;
      },
      fallbackFonts: [{ key: 'boot-font', familyName: 'Roboto', data: roboto }],
    });

    // Enqueued BEFORE the boot even starts — it must still arrive after the
    // boot-config font registration.
    await engine.fonts.register({ key: 'user-font', familyName: 'Roboto', data: roboto });

    const fontPacks = worker.received.filter(
      (r): r is Extract<WorkerRequest, { kind: 'fonts.register' }> => r.kind === 'fonts.register',
    );
    expect(fontPacks.map((r) => r.fontKey)).toEqual(['boot-font', 'user-font']);
    const kinds = worker.received.map((r) => r.kind);
    expect(kinds.indexOf('fonts.addFallback')).toBeLessThan(kinds.lastIndexOf('fonts.register'));

    await engine.destroy();
  });

  test('`url` fonts are fetched at boot and registered', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(roboto, { status: 200 }) as unknown as Response);

    const engine = localEngine({
      worker: fakeWorker,
      fallbackFonts: [{ key: 'remote', familyName: 'Roboto', url: 'https://example.test/f.ttf' }],
    });
    engine.warmup();
    await engine.fonts.clearFallbacks();

    expect(fetchSpy).toHaveBeenCalledWith('https://example.test/f.ttf');
    expect(engine.fonts.list().map((f) => f.key)).toEqual(['remote']);
    await engine.destroy();
  });

  test('a bad font spec fails the boot: queued jobs reject and the worker is torn down', async () => {
    let worker: FakeWorker | undefined;
    const engine = localEngine({
      worker: () => {
        worker = new FakeWorker();
        return worker as unknown as Worker;
      },
      fallbackFonts: [{ key: 'bad', familyName: 'Roboto' }],
    });

    await expect(engine.fonts.clearFallbacks()).rejects.toThrow(/exactly one of `data` or `url`/);
    // The worker spawned during boot must not leak past the failure.
    expect(worker?.terminated).toBe(true);

    // The failure is permanent — later jobs reject instead of hanging.
    await expect(
      engine.fonts.register({ key: 'later', familyName: 'Roboto', data: roboto }),
    ).rejects.toThrow(/failed to boot/);
  });

  test('a live Worker that turns ready before the first operation does not hang the boot', async () => {
    const worker = new FakeWorker();
    const engine = localEngine({ worker: worker as unknown as Worker });

    // Let the worker finish initializing and emit `ready` while the engine is
    // still dormant. Without the construction-time readiness latch, the boot's
    // handshake listener would attach only now — after `ready` already fired —
    // and the first operation below would hang forever.
    await vi.waitFor(() => {
      if (!worker.ready) throw new Error('worker not ready yet');
    });

    await expect(
      engine.fonts.register({ key: 'r', familyName: 'Roboto', data: roboto }),
    ).resolves.toBeDefined();
    await engine.destroy();
    expect(worker.terminated).toBe(true);
  });

  test('destroying a never-used engine terminates a caller-provided live Worker', async () => {
    const worker = new FakeWorker();
    const engine = localEngine({ worker: worker as unknown as Worker });

    await engine.destroy();
    // The boot never ran, so only the abandon hook can reclaim the worker.
    expect(worker.terminated).toBe(true);
  });
});

describe('createLocalEngineWithWorker()', () => {
  afterEach(() => {
    FakeWorker.spawned = 0;
  });

  test('a live Worker that turns ready early still completes the first operation', async () => {
    const worker = new FakeWorker();
    const engine = createLocalEngineWithWorker({ worker: worker as unknown as Worker });

    await vi.waitFor(() => {
      if (!worker.ready) throw new Error('worker not ready yet');
    });

    await expect(
      engine.fonts.register({ key: 'r', familyName: 'Roboto', data: roboto }),
    ).resolves.toBeDefined();
    await engine.destroy();
  });

  test('destroying a never-used engine terminates a caller-provided live Worker', async () => {
    const worker = new FakeWorker();
    const engine = createLocalEngineWithWorker({ worker: worker as unknown as Worker });
    await engine.destroy();
    expect(worker.terminated).toBe(true);
  });
});
