/**
 * E8 (annotation transfer plan §6): what a bundle costs, and a bundle at
 * every default limit. Env-gated (`EPDF_TRANSFER_BENCH=1`); prints tables and
 * asserts only that each run succeeds. `EPDF_TRANSFER_BENCH_LIMITS=1` also
 * runs a bundle at each default limit, which takes minutes.
 */
import { describe, expect, test } from 'vitest';
import {
  AnnotationTransfer,
  DEFAULT_ANNOTATION_BUNDLE_LIMITS,
  manifestBytesOf,
  type AnnotationBundle,
} from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';
import {
  fill,
  kb,
  pageRefs,
  pages,
  png,
  timed,
  type Doc,
  type Engine,
} from './helpers/transferBench';

const ENABLED = !!process.env.EPDF_TRANSFER_BENCH;
const LIMITS = !!process.env.EPDF_TRANSFER_BENCH_LIMITS;

describe.skipIf(!ENABLED).each(['wasm', 'native'] as const)(
  'E8 annotation transfer (%s)',
  (prefer) => {
    let opened = 0;
    const open = (engine: Engine, bytes: Uint8Array) =>
      engine.open({ kind: 'bytes', id: `e8-${++opened}`, bytes }, { scope: ['*'] });

    /** Export `source`, round-trip the file, import into a copy of `base`, and print it all. */
    async function measure(
      engine: Engine,
      label: string,
      base: Uint8Array,
      source: Doc,
      rows: string[],
    ): Promise<AnnotationBundle> {
      const bundle = await timed(rows, 'export', () => source.annotations.export());
      const manifest = manifestBytesOf(bundle);
      const resources = Object.values(bundle.resources).reduce(
        (sum, bytes) => sum + bytes.length,
        0,
      );
      const text = await timed(rows, 'AnnotationTransfer.stringify', async () =>
        AnnotationTransfer.stringify(bundle),
      );
      await timed(rows, 'AnnotationTransfer.parse', () => AnnotationTransfer.parse(text));
      const target = await open(engine, base);
      const result = await timed(rows, 'import (stamp)', () =>
        target.annotations.import(bundle, { attribution: 'stamp' }),
      );
      expect(result.dropped.filter((drop) => !drop.field)).toEqual([]);
      await timed(rows, 'export of the copy', () => target.annotations.export());
      const saved = await target.download({ mode: 'rewrite' });
      rows.push(
        `items ${bundle.items.length}, pages ${bundle.pages.length}, resources ${Object.keys(bundle.resources).length}`,
        `manifest ${kb(manifest)} (${(manifest / bundle.items.length).toFixed(0)} B an item), resources ${kb(resources)}, file ${kb(text.length)}`,
        `copy's PDF ${kb(saved.length)} (the base ${kb(base.length)})`,
      );
      console.log(`\n── E8 ${prefer}: ${label}\n${rows.join('\n')}`);
      await target.close();
      return bundle;
    }

    test('1 000 mixed annotations over 20 pages', async () => {
      const engine = await createLocalEngine({ runtime: { prefer } });
      try {
        const base = pages(20);
        const source = await open(engine, base);
        const rows: string[] = [];
        await timed(rows, 'create 1 000, one call each', () => fill(source, 1000));
        await measure(engine, '1 000 mixed annotations', base, source, rows);
        await source.close();
      } finally {
        await engine.destroy();
      }
    }, 600_000);

    describe.skipIf(!LIMITS)('a bundle at each default limit', () => {
      const limits = DEFAULT_ANNOTATION_BUNDLE_LIMITS;

      test(`items: ${limits.items} mixed annotations over 200 pages`, async () => {
        const engine = await createLocalEngine({ runtime: { prefer } });
        try {
          const base = pages(200);
          const source = await open(engine, base);
          const rows: string[] = [];
          await timed(rows, `create ${limits.items}`, () => fill(source, limits.items));
          await measure(engine, `${limits.items} items`, base, source, rows);
          await source.close();
        } finally {
          await engine.destroy();
        }
      }, 1_800_000);

      test(`pages: one square on each of ${limits.pages} pages`, async () => {
        const engine = await createLocalEngine({ runtime: { prefer } });
        try {
          const base = pages(limits.pages);
          const source = await open(engine, base);
          const rows: string[] = [];
          const rect = { left: 40, bottom: 40, right: 120, top: 100 };
          await timed(rows, `create ${limits.pages}`, async () => {
            for (const page of await pageRefs(source)) {
              await source.page(page).annotations.create({ subtype: 'square', rect });
            }
          });
          await measure(engine, `${limits.pages} pages`, base, source, rows);
          await source.close();
        } finally {
          await engine.destroy();
        }
      }, 1_800_000);

      test(`resources: ${limits.resources} different stamp images`, async () => {
        const engine = await createLocalEngine({ runtime: { prefer } });
        try {
          const base = pages(20);
          const source = await open(engine, base);
          const refs = await pageRefs(source);
          const rows: string[] = [];
          await timed(rows, `create ${limits.resources} stamps`, async () => {
            for (let i = 0; i < limits.resources; i++) {
              const left = 20 + ((i >> 4) % 10) * 55;
              const bottom = 40 + (i % 12) * 60;
              await source
                .page(refs[i % refs.length]!)
                .annotations.create(
                  { subtype: 'stamp', rect: { left, bottom, right: left + 50, top: bottom + 40 } },
                  { appearance: png(16, 16, [i & 255, (i >> 8) & 255, 128]) },
                );
            }
          });
          await measure(engine, `${limits.resources} resources`, base, source, rows);
          await source.close();
        } finally {
          await engine.destroy();
        }
      }, 1_800_000);

      test('bundle bytes: one file just under the bundle limit', async () => {
        const engine = await createLocalEngine({ runtime: { prefer } });
        try {
          const base = pages(1);
          const source = await open(engine, base);
          const rows: string[] = [];
          const bytes = new Uint8Array(limits.bundleBytes - 64 * 1024).map(
            (_, i) => (i * 31) & 255,
          );
          await timed(rows, `create a ${kb(bytes.length)} attachment`, async () => {
            await source.page((await pageRefs(source))[0]!).annotations.create(
              {
                subtype: 'file-attachment',
                rect: { left: 40, bottom: 40, right: 60, top: 60 },
                file: { name: 'large.bin' },
              },
              { file: bytes },
            );
          });
          await measure(engine, 'bundle bytes', base, source, rows);
          await source.close();
        } finally {
          await engine.destroy();
        }
      }, 1_800_000);

      test(`image pixels: a ${limits.imagePixels / 1e6} MP stamp image`, async () => {
        const engine = await createLocalEngine({ runtime: { prefer } });
        try {
          const base = pages(1);
          const source = await open(engine, base);
          const rows: string[] = [];
          const image = png(8000, limits.imagePixels / 8000, [200, 40, 40]);
          await timed(rows, `create a stamp of ${kb(image.length)} PNG`, async () => {
            await source
              .page((await pageRefs(source))[0]!)
              .annotations.create(
                { subtype: 'stamp', rect: { left: 40, bottom: 40, right: 440, top: 290 } },
                { appearance: image },
              );
          });
          await measure(engine, 'image pixels', base, source, rows);
          await source.close();
        } finally {
          await engine.destroy();
        }
      }, 1_800_000);
    });
  },
);
