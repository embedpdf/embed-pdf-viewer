/**
 * The encoder-worker pool contract — above all, the REGRESSION that made the
 * pool dead code for every default consumer: the literal source `'inline'`
 * is a string, and a branch-order slip resolved it as the URL "/inline"
 * (HTML → SyntaxError → permanent main-thread fallback). These tests pin
 * which worker each source kind constructs and that the pool round-trip is
 * actually used.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PageRaster } from '@embedpdf/engine-core/runtime';
import { EngineError } from '@embedpdf/engine-core/runtime';
import { BrowserImageEncoder } from '../src/render/BrowserImageEncoder';

const constructed: string[] = [];
let respond = true;

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  constructor(url: string | URL) {
    constructed.push(String(url));
  }
  postMessage(msg: { id: string }): void {
    if (!respond) return;
    setTimeout(() => {
      this.onmessage?.({ data: { id: msg.id, ok: true, bytes: new ArrayBuffer(4) } });
    }, 0);
  }
  terminate(): void {}
}

const raster: PageRaster = {
  width: 2,
  height: 2,
  stride: 8,
  color: 'rgba8',
  premultipliedAlpha: false,
  data: new ArrayBuffer(16),
};

const options = { format: 'webp' as const };

beforeEach(() => {
  constructed.length = 0;
  respond = true;
  (globalThis as Record<string, unknown>).Worker = FakeWorker;
  (globalThis as Record<string, unknown>).OffscreenCanvas = class {};
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).Worker;
  delete (globalThis as Record<string, unknown>).OffscreenCanvas;
});

describe('BrowserImageEncoder worker sourcing', () => {
  it("the DEFAULT ('inline') builds the bundled blob worker — never fetches '/inline'", async () => {
    const encoder = new BrowserImageEncoder();
    const result = await encoder.encode(raster, options, new AbortController().signal);
    expect(constructed.length).toBeGreaterThan(0);
    for (const url of constructed) {
      expect(url.startsWith('blob:')).toBe(true);
      expect(url.includes('inline')).toBe(false);
    }
    // …and the pool actually did the work (the fake pool round-tripped).
    expect(result.source.kind).toBe('bytes');
    encoder.destroy();
  });

  it("an explicit 'inline' behaves identically to the default", async () => {
    const encoder = new BrowserImageEncoder({ worker: 'inline' });
    await encoder.encode(raster, options, new AbortController().signal);
    expect(constructed.every((u) => u.startsWith('blob:'))).toBe(true);
    encoder.destroy();
  });

  it('a URL string constructs workers from that URL', async () => {
    const encoder = new BrowserImageEncoder({ worker: '/workers/encoder-worker.js' });
    await encoder.encode(raster, options, new AbortController().signal);
    expect(constructed.length).toBeGreaterThan(0);
    expect(constructed.every((u) => u.endsWith('/workers/encoder-worker.js'))).toBe(true);
    encoder.destroy();
  });

  it('worker: false never constructs a Worker (explicit main-thread opt-out)', async () => {
    const encoder = new BrowserImageEncoder({ worker: false });
    // Node has no canvas — the main-thread path throws RuntimeUnavailable,
    // which is exactly the proof that no pool was attempted first.
    await expect(
      encoder.encode(raster, options, new AbortController().signal),
    ).rejects.toBeInstanceOf(EngineError);
    expect(constructed).toHaveLength(0);
    encoder.destroy();
  });

  it('a factory source is used verbatim', async () => {
    let made = 0;
    const encoder = new BrowserImageEncoder({
      worker: () => {
        made += 1;
        return new FakeWorker('factory://') as unknown as Worker;
      },
    });
    await encoder.encode(raster, options, new AbortController().signal);
    expect(made).toBeGreaterThan(0);
    encoder.destroy();
  });
});
