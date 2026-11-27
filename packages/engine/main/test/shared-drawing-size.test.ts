import { deflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pdfOf } from '@embedpdf/engine-core/conformance';
import { toPageRef, type DocumentHandle } from '@embedpdf/engine-core/runtime';
import { createLocalEngine, type LocalEngine } from '../src/index';

/**
 * One picture shown in many places is stored once: the mark in ten signature
 * fields, ten push buttons and ten stamps each add one drawing, and a small
 * placement per box. Measured with a PNG of about 17 KB, noise that
 * compresses as badly as a photo. Before marks were drawings, ten marks of
 * it saved as ten pictures (177.8 KB against 18.7 KB for one, on 3.4.0).
 */

/** One empty A4 page (object 3). */
const PAGE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << >> >>',
  '<< /Length 0 >>\nstream\n\nendstream',
]);
const PAGE = toPageRef(3);

/** A noisy RGB PNG, the same on every run: it compresses badly, as a photo does. */
function noisyPng(width: number, height: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
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
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, width);
  header.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  let seed = 7;
  const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 24;
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width * 3; x++) raw[y * (1 + width * 3) + 1 + x] = next();
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

/** About 17 KB. */
const PICTURE = noisyPng(80, 70);

const imagesIn = (pdf: Uint8Array): number =>
  (new TextDecoder('latin1').decode(pdf).match(/\/Subtype\s*\/Image\b/g) ?? []).length;

const box = (at: number) => ({
  x: 40 + (at % 2) * 260,
  y: 40 + Math.floor(at / 2) * 70,
  width: 200,
  height: 60,
});

describe('one picture, many places: stored once', () => {
  let engine: LocalEngine;

  beforeAll(async () => {
    engine = await createLocalEngine();
  });

  afterAll(async () => {
    await engine.destroy();
  });

  let opened = 0;
  const saved = async (
    place: (doc: DocumentHandle, count: number) => Promise<void>,
    count: number,
  ) => {
    const doc = await engine.open(
      { kind: 'bytes', id: `drawing-size-${opened++}`, bytes: PAGE_PDF.slice() },
      { scope: ['*'] },
    );
    try {
      await place(doc, count);
      return await doc.download();
    } finally {
      await doc.close();
    }
  };

  const marks = async (doc: DocumentHandle, count: number) => {
    for (let at = 0; at < count; at++) {
      const { field } = await doc.forms.create({
        kind: 'signature',
        name: `signature_${at}`,
        widgets: [{ page: PAGE, box: box(at) }],
      });
      await doc.forms.setSignatureAppearance(field.ref, PICTURE);
    }
  };
  const buttons = async (doc: DocumentHandle, count: number) => {
    for (let at = 0; at < count; at++) {
      const { field } = await doc.forms.create({
        kind: 'pushbutton',
        name: `initials_${at}`,
        widgets: [{ page: PAGE, box: box(at), layout: 'image' }],
      });
      await doc.forms.setButtonImage(field.ref, PICTURE);
    }
  };
  const stamps = async (doc: DocumentHandle, count: number) => {
    for (let at = 0; at < count; at++) {
      await doc
        .page(PAGE)
        .annotations.create(
          { subtype: 'stamp', box: box(at) },
          { resources: { appearance: PICTURE } },
        );
    }
  };

  test('the picture is about 17 KB', () => {
    expect(PICTURE.byteLength).toBeGreaterThan(16_000);
    expect(PICTURE.byteLength).toBeLessThan(18_000);
  });

  for (const [what, place] of [
    ['a mark in signature fields', marks],
    ['a push button picture', buttons],
    ['a stamp', stamps],
  ] as const) {
    test(`${what}: ten places save one picture, and little more than one place does`, async () => {
      const one = await saved(place, 1);
      const ten = await saved(place, 10);
      // For the record: the sizes, one place and ten.
      console.info(
        `${what}: 1 place ${(one.byteLength / 1024).toFixed(1)} KB, 10 places ${(ten.byteLength / 1024).toFixed(1)} KB`,
      );
      expect(imagesIn(one)).toBe(1);
      expect(imagesIn(ten)).toBe(1);
      // Nine more places add their boxes and placements, never the picture again.
      expect(ten.byteLength - one.byteLength).toBeLessThan(PICTURE.byteLength);
    });
  }
});
