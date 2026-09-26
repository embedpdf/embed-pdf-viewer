import { readFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationResourceConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { toPageRef } from '@embedpdf/engine-core';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = {
  authoring: resolve(here, 'fixtures', 'hello_world.pdf'),
  'acrobat-stamps': resolve(here, 'fixtures', 'stamp-opacity-acrobat.pdf'),
  'acrobat-rewrapped': resolve(here, 'fixtures', 'stamp-rewrapped-acrobat.pdf'),
  'acrobat-roundtrip-60': resolve(here, 'fixtures', 'stamp-roundtrip-acrobat-60.pdf'),
  'acrobat-roundtrip-100': resolve(here, 'fixtures', 'stamp-roundtrip-acrobat-100.pdf'),
};

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let opened = 0;

runAnnotationResourceConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: async (engine, fixture) =>
    engine.open(
      {
        kind: 'bytes',
        id: `${fixture}-${++opened}`,
        bytes: new Uint8Array(await readFile(fixtures[fixture])),
      },
      { scope: ['*'] },
    ),
  rawAppearances: true,
});

// The same drawing is the same bytes on both runtimes, so a bundle made by the
// local engine and one made by the cloud engine name their resources alike.
/** A one-page vector drawing, 100 × 50. */
const drawing = (() => {
  const content = '1 0 0 rg 0 0 60 50 re f 0 0 1 rg 60 0 40 50 re f';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 50] /Contents 4 0 R /Resources << >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let text = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = text.length;
  text += `xref\n0 5\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(text);
})();

describe('drawing bytes across runtimes', () => {
  /** The drawings of a vector stamp made here and of the two Acrobat stamps. */
  const drawingsOn = async (prefer: 'wasm' | 'native') => {
    const engine = await createLocalEngine({ runtime: { prefer } });
    try {
      const doc = await engine.open(
        {
          kind: 'bytes',
          id: `runtimes-${prefer}-${++opened}`,
          bytes: new Uint8Array(await readFile(fixtures['acrobat-stamps'])),
        },
        { scope: ['*'] },
      );
      const { pages } = await doc.pages.list();
      const page = doc.page(toPageRef(pages[0]!.ref.pageObjectNumber));
      const acrobat = (await page.annotations.list()).annotations.filter(
        (annotation) => annotation.subtype === 'stamp',
      );
      const { annotation: created } = await page.annotations.create(
        { subtype: 'stamp', rect: { left: 20, bottom: 20, right: 120, top: 70 }, opacity: 0.5 },
        { appearance: drawing },
      );
      const drawings = [];
      for (const stamp of [created, ...acrobat]) {
        drawings.push(await page.annotations.downloadResource(stamp.ref, 'appearance'));
      }
      await doc.close();
      return drawings;
    } finally {
      await engine.destroy();
    }
  };

  test('wasm and native export the same drawings as the same bytes', async () => {
    const wasm = await drawingsOn('wasm');
    const native = await drawingsOn('native');
    expect(wasm.length).toBe(3);
    wasm.forEach((bytes, i) => {
      expect(Buffer.from(bytes).equals(Buffer.from(native[i]!))).toBe(true);
    });
  });
});

/** 128 × 128 of noise: a PNG a file can't hide. */
const noisePng = () => {
  let seed = 11;
  const next = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 0xff;
  const width = 128;
  const rows: number[] = [];
  for (let y = 0; y < width; y++) {
    rows.push(0);
    for (let x = 0; x < width * 3; x++) rows.push(next());
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(width, 4);
  header[8] = 8;
  header[9] = 2;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(Buffer.from(rows))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
};

// A stamp given a new drawing keeps nothing of the old one: a full rewrite
// is the size of the document with the new drawing only.
describe('replacing a stamp drawing', () => {
  test('a full rewrite after a new drawing has none of the old', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const doc = await engine.open(
        {
          kind: 'bytes',
          id: `replace-${++opened}`,
          bytes: new Uint8Array(await readFile(fixtures.authoring)),
        },
        { scope: ['*'] },
      );
      const { pages } = await doc.pages.list();
      const page = doc.page(toPageRef(pages[0]!.ref.pageObjectNumber));
      const rect = { left: 20, bottom: 20, right: 120, top: 120 };
      const small = (
        await page.annotations.create({ subtype: 'stamp', rect }, { appearance: drawing })
      ).annotation;
      const withSmall = (await doc.download({ mode: 'rewrite' })).length;
      await page.annotations.delete(small.ref);

      const image = noisePng();
      const stamp = (
        await page.annotations.create({ subtype: 'stamp', rect }, { appearance: image })
      ).annotation;
      const withImage = (await doc.download({ mode: 'rewrite' })).length;
      expect(withImage - withSmall > image.length / 2).toBe(true);

      await page.annotations.update(stamp.ref, {}, { appearance: drawing });
      const replaced = (await doc.download({ mode: 'rewrite' })).length;
      // Back to the size with the small drawing: the image is gone.
      expect(Math.abs(replaced - withSmall) < 1024).toBe(true);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });
});

// The drawings a document holds are found again after a reopen: placing the
// same artwork adds a wrapper, not another copy.
describe('stamp drawings across a reopen', () => {
  test('artwork a reopened document already has is placed again', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const image = noisePng();
      const place = async (bytes: Uint8Array, left: number) => {
        const doc = await engine.open(
          { kind: 'bytes', id: `reopen-${++opened}`, bytes },
          { scope: ['*'] },
        );
        const { pages } = await doc.pages.list();
        const page = doc.page(toPageRef(pages[0]!.ref.pageObjectNumber));
        await page.annotations.create(
          { subtype: 'stamp', rect: { left, bottom: 20, right: left + 100, top: 120 } },
          { appearance: image },
        );
        const saved = await doc.download({ mode: 'rewrite' });
        await doc.close();
        return saved;
      };
      const once = await place(new Uint8Array(await readFile(fixtures.authoring)), 20);
      const twice = await place(once, 200);
      expect(twice.length - once.length < image.length / 4).toBe(true);
    } finally {
      await engine.destroy();
    }
  });
});
