import { readFile } from 'node:fs/promises';
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
describe('drawing bytes across runtimes', () => {
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
  const drawing = new TextEncoder().encode(text);

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
      const { created } = await page.annotations.create(
        { subtype: 'stamp', rect: { left: 20, bottom: 20, right: 120, top: 70 }, opacity: 0.5 },
        { appearance: drawing },
      );
      const drawings = [];
      for (const stamp of [created, ...acrobat]) {
        drawings.push(await page.annotations.readResource(stamp.ref, 'appearance'));
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
