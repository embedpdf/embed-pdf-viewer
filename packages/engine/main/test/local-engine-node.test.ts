/**
 * `localEngine()` is the one local factory, in Node too: with no `Worker`
 * global it runs PDFium in this thread, and renders PNG with the portable
 * encoder (no canvas needed).
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { EngineError, EngineErrorCode, localEngine } from '../src/index';

const fixture = resolve(__dirname, 'fixtures', 'hello_world.pdf');

/** The chunks of a PNG, each checksum checked. */
function pngChunks(bytes: Uint8Array): Map<string, Uint8Array[]> {
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = new Map<string, Uint8Array[]>();
  for (let at = 8; at < bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const data = bytes.subarray(at + 8, at + 8 + length);
    expect(view.getUint32(at + 8 + length), `${type} CRC`).toBe(
      crc32(bytes.subarray(at + 4, at + 8 + length)),
    );
    chunks.set(type, [...(chunks.get(type) ?? []), data]);
    at += 12 + length;
  }
  return chunks;
}

describe('localEngine() in Node', () => {
  test('opens, renders a PNG with the pixels of the raw render, and destroys', async () => {
    expect(typeof Worker).toBe('undefined');
    const engine = localEngine();
    try {
      const doc = await engine.open({
        kind: 'bytes',
        id: 'node',
        bytes: new Uint8Array(await readFile(fixture)),
      });
      const { pages } = await doc.pages.list();
      const page = doc.page(pages[0]!.ref);
      const viewport = { kind: 'width', width: 200 } as const;

      const image = await page.render.image({ viewport });
      expect(image.format).toBe('png');
      expect(image.contentType).toBe('image/png');
      if (image.source.kind !== 'bytes') throw new Error('expected bytes');

      const chunks = pngChunks(image.source.bytes);
      const header = new DataView(
        chunks.get('IHDR')![0]!.buffer,
        chunks.get('IHDR')![0]!.byteOffset,
      );
      expect([header.getUint32(0), header.getUint32(4)]).toEqual([image.width, image.height]);
      expect(chunks.has('IEND')).toBe(true);

      // Inflated, the image is the raw render's rows, each behind filter byte 0.
      const scanlines = inflateSync(Buffer.concat(chunks.get('IDAT')!));
      const raster = await page.render.raw({ viewport });
      const rowBytes = raster.width * 4;
      expect(scanlines.length).toBe((rowBytes + 1) * raster.height);
      const pixels = new Uint8Array(raster.data);
      for (let y = 0; y < raster.height; y++) {
        const row = scanlines.subarray(y * (rowBytes + 1), (y + 1) * (rowBytes + 1));
        expect(row[0]).toBe(0);
        expect(
          Buffer.from(row.subarray(1)).equals(
            Buffer.from(pixels.subarray(y * raster.stride, y * raster.stride + rowBytes)),
          ),
        ).toBe(true);
      }
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });

  test('WebP needs a canvas or your own encoder: NotImplemented, saying so', async () => {
    const engine = localEngine();
    try {
      const doc = await engine.open({
        kind: 'bytes',
        id: 'webp',
        bytes: new Uint8Array(await readFile(fixture)),
      });
      const { pages } = await doc.pages.list();
      const error = await doc
        .page(pages[0]!.ref)
        .render.image({ format: 'webp' })
        .then(
          () => null,
          (caught: unknown) => caught,
        );
      expect(EngineError.is(error, EngineErrorCode.NotImplemented)).toBe(true);
      expect(String((error as Error).message)).toContain('imageEncoder');
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });

  test('takes the runtime to use, and the options createLocalEngine took', async () => {
    const engine = localEngine({
      runtime: { prefer: 'wasm' },
      signedDocumentPolicy: 'permit',
      sessionKind: 'plain',
    });
    try {
      const doc = await engine.open({
        kind: 'bytes',
        id: 'wasm',
        bytes: new Uint8Array(await readFile(fixture)),
      });
      expect((await doc.pages.list()).pageCount).toBe(1);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });
});
