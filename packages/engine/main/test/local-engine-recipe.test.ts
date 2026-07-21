import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WirePack, WorkerResponse } from '@embedpdf/engine-core/runtime';
import { WorkerHost } from '@embedpdf/engine-services';
import { createPdfRuntime } from '@embedpdf/engine-runtime';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { localEngine } from '../src/index';
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
 * were created (recipe freshness); `terminated` proves teardown.
 */
class FakeWorker {
  static spawned = 0;
  terminated = false;
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
    if (this.host) this.host.receive(payload as WorkerRequest);
    else this.queue.push(payload as WorkerRequest);
  }
  terminate(): void {
    this.terminated = true;
  }
}

const fakeWorker = () => new FakeWorker() as unknown as Worker;

describe('localEngine() recipe', () => {
  afterEach(() => {
    FakeWorker.spawned = 0;
    vi.restoreAllMocks();
  });

  test('is inert until called — building the recipe spawns no worker', () => {
    const spawn = vi.fn(fakeWorker);
    localEngine({ worker: spawn });
    expect(spawn).not.toHaveBeenCalled();
    expect(FakeWorker.spawned).toBe(0);
  });

  test('each call boots a fresh, independent engine (StrictMode / multi-viewer)', async () => {
    const spawn = vi.fn(fakeWorker);
    const recipe = localEngine({ worker: spawn });

    const a = await recipe();
    const b = await recipe();

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(a).not.toBe(b);

    await a.destroy();
    await b.destroy();
  });

  test('the `worker` thunk is honored (called once per boot)', async () => {
    const spawn = vi.fn(fakeWorker);
    const engine = await localEngine({ worker: spawn })();
    expect(spawn).toHaveBeenCalledTimes(1);
    await engine.destroy();
  });

  test('registers `fonts` then `fallbackFonts`, preserving declared order', async () => {
    const engine = await localEngine({
      worker: fakeWorker,
      fonts: [{ key: 'plain', familyName: 'Roboto', data: roboto }],
      fallbackFonts: [
        { key: 'fb-1', familyName: 'Roboto', data: roboto },
        { key: 'fb-2', familyName: 'Roboto', data: roboto },
      ],
    })();

    // list() reflects registration order: plain `fonts` first, then fallbacks.
    expect(engine.fonts?.list().map((f) => f.key)).toEqual(['plain', 'fb-1', 'fb-2']);
    await engine.destroy();
  });

  test('`url` fonts are fetched at boot and registered', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(roboto, { status: 200 }) as unknown as Response);

    const engine = await localEngine({
      worker: fakeWorker,
      fallbackFonts: [{ key: 'remote', familyName: 'Roboto', url: 'https://example.test/f.ttf' }],
    })();

    expect(fetchSpy).toHaveBeenCalledWith('https://example.test/f.ttf');
    expect(engine.fonts?.list().map((f) => f.key)).toEqual(['remote']);
    await engine.destroy();
  });

  test('a font with neither `data` nor `url` fails the boot and tears the worker down', async () => {
    let worker: FakeWorker | undefined;
    const recipe = localEngine({
      worker: () => {
        worker = new FakeWorker();
        return worker as unknown as Worker;
      },
      fallbackFonts: [{ key: 'bad', familyName: 'Roboto' }],
    });

    await expect(recipe()).rejects.toThrow(/exactly one of `data` or `url`/);
    // The engine booted (worker spawned) before the font error — it must not leak.
    expect(worker?.terminated).toBe(true);
  });
});
