import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type {
  DocumentHandle,
  StampAnnotationDTO,
  WirePack,
  WorkerRequest,
  WorkerResponse,
} from '@embedpdf/engine-core/runtime';
import { createPdfRuntime } from '@embedpdf/engine-runtime';
import { InlineTransport, LazyTransport, LocalEngine, type Transport } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'annotations.pdf',
);
const PAGE_OBJECT_NUMBER = 3;

/**
 * InlineTransport ignores `pack.transfer` (no thread boundary), which is
 * exactly why the ordinary stamp tests never noticed buffers being detached.
 * This transport reproduces what BrowserWorkerTransport's postMessage does:
 * structured-clone the payload and DETACH every buffer on the transfer list.
 */
class DetachingInlineTransport implements Transport {
  constructor(private readonly inner: InlineTransport) {}
  send(pack: WirePack<WorkerRequest>): void {
    const payload = structuredClone(pack.payload, { transfer: [...pack.transfer] });
    this.inner.send({ payload, transfer: [] });
  }
  onMessage(handler: (msg: WorkerResponse) => void): () => void {
    return this.inner.onMessage(handler);
  }
  terminate(): Promise<void> {
    return this.inner.terminate();
  }
}

/** Minimal valid PNG (same generator as annotations-stamp.test.ts). */
function makePng(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(
      [...type].map((ch) => ch.charCodeAt(0)),
      4,
    );
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    for (let x = 0; x < width; x++) raw.set(rgba, row + 1 + x * 4);
  }
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = new Uint8Array(deflateSync(raw));
  const parts = [
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    png.set(p, offset);
    offset += p.length;
  }
  return png;
}

describe('stamp annotations: resource buffers survive a detaching transport', () => {
  let engine: LocalEngine;
  let handle: DocumentHandle;

  beforeAll(async () => {
    const transport = new LazyTransport(
      async () =>
        new DetachingInlineTransport(
          new InlineTransport(await createPdfRuntime({ prefer: 'wasm' })),
        ),
    );
    engine = LocalEngine.fromTransport({ transport });
    const bytes = new Uint8Array(await readFile(fixturePath));
    handle = await engine.open({ kind: 'bytes', id: 'stamp-transfer-test', bytes });
  });

  afterAll(async () => {
    await handle.close();
    await engine.destroy();
  });

  test('self-check: the transport really detaches transferred buffers', () => {
    const buf = new ArrayBuffer(8);
    structuredClone({ buf }, { transfer: [buf] });
    expect(buf.byteLength).toBe(0);
  });

  test('the same Uint8Array can be placed twice, and updated with, without being detached', async () => {
    const page = handle.page(PAGE_OBJECT_NUMBER);
    // A full-span view — the case the resolver used to hand over by reference.
    const png = makePng(8, 4, [0, 128, 255, 255]);
    const original = Array.from(png);
    expect(png.byteOffset).toBe(0);
    expect(png.byteLength).toBe(png.buffer.byteLength);

    const first = await page.annotations.create({
      subtype: 'stamp',
      rect: { left: 100, bottom: 500, right: 260, top: 580 },
      source: png,
      name: 'Approved',
    });
    expect(png.byteLength).toBe(original.length);
    expect(Array.from(png)).toEqual(original);

    // Second placement from the very same bytes (a stamp library re-arming).
    const second = await page.annotations.create({
      subtype: 'stamp',
      rect: { left: 100, bottom: 300, right: 260, top: 380 },
      source: png,
      name: 'Approved',
    });
    expect((second.created as StampAnnotationDTO).name).toBe('Approved');
    expect(png.byteLength).toBe(original.length);

    // Source update through the same path.
    await page.annotations.update(first.created.ref, { subtype: 'stamp', source: png });
    expect(png.byteLength).toBe(original.length);
    expect(Array.from(png)).toEqual(original);

    const snapshot = await page.annotations.list();
    const stamps = snapshot.annotations.filter((a) => a.subtype === 'stamp');
    expect(stamps.length).toBeGreaterThanOrEqual(2);
  });
});
