/**
 * Probe (Oct 2026): what a save point costs on the local engine.
 *
 * A save point is the layer saved to bytes before an action runs, so that a
 * failed action can be thrown away and the document reopened from base + save
 * point (see platform docs/plans/2026-10-04-optimistic-writes-forms-history.md).
 * This measures, as the layer grows: a normal small edit, taking a save point
 * (`downloadLayer`, the layer only), and the reopen a failed action would need.
 *
 * Env-gated (`EPDF_SAVEPOINT_BENCH=1`); prints a table and asserts only that
 * each step works. The large images are noise, which barely compresses: a
 * worst case for layer size.
 */
import { performance } from 'node:perf_hooks';
import { describe, expect, test } from 'vitest';
import { iconRect } from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';
import { fill, pageRefs, pages, png } from './helpers/transferBench';

const ENABLED = !!process.env.EPDF_SAVEPOINT_BENCH;
const ROUNDS = 5;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};
const ms = (value: number) => `${value.toFixed(0).padStart(6)} ms`;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).padStart(6)} MB`;

/** Noise in every channel, so the image stays close to its raw size. */
function noisyPng(width: number, height: number, seed: number): Uint8Array {
  // xorshift32: stays in 32-bit integers, so no precision is lost.
  let state = seed | 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 0xff;
  };
  return png(width, height, () => [next(), next(), next()]);
}

describe.skipIf(!ENABLED).each(['wasm', 'native'] as const)('save point cost (%s)', (prefer) => {
  test('as the layer grows', { timeout: 600_000 }, async () => {
    const engine = createLocalEngine({ runtime: { prefer } });
    const base = pages(20);
    const doc = await engine.open(
      { kind: 'bytes', id: 'savepoint', bytes: base },
      { scope: ['*'] },
    );
    const page = doc.page((await pageRefs(doc))[0]!);
    const { annotation: target } = await page.annotations.create({
      subtype: 'text',
      rect: iconRect(560, 740),
      contents: 'edited every round',
    });
    const rows = [
      `${'layer holds'.padEnd(34)} ${'layer'.padStart(9)} ${'small edit'.padStart(10)} ${'save point'.padStart(10)} ${'reopen'.padStart(10)}`,
    ];

    let reopened = 0;
    async function stage(label: string) {
      const edit: number[] = [];
      const save: number[] = [];
      const reopen: number[] = [];
      let size = 0;
      for (let round = 0; round < ROUNDS; round++) {
        let t0 = performance.now();
        await page.annotations.update(target.ref, { contents: `${label} round ${round}` });
        edit.push(performance.now() - t0);

        t0 = performance.now();
        const layer = await doc.downloadLayer();
        save.push(performance.now() - t0);
        size = layer.byteLength;

        t0 = performance.now();
        const copy = await engine.open(
          {
            kind: 'layerBytes',
            id: `savepoint-reopen-${++reopened}`,
            baseBytes: base,
            layer: { kind: 'artifact', bytes: layer },
          },
          { scope: ['*'] },
        );
        await copy.pages.list();
        reopen.push(performance.now() - t0);
        await copy.close();
      }
      rows.push(
        `${label.padEnd(34)} ${mb(size)} ${ms(median(edit)).padStart(10)} ${ms(median(save)).padStart(10)} ${ms(median(reopen)).padStart(10)}`,
      );
    }

    await stage('one note');
    await fill(doc, 200);
    await stage('+ 200 mixed annotations');

    const images: string[] = [];
    for (let i = 0; i < 4; i++) {
      const bytes = noisyPng(3000, 2000, 7 + i);
      const t0 = performance.now();
      await page.annotations.create(
        { subtype: 'stamp', box: { x: 40 + i * 20, y: 300 + i * 20, width: 300, height: 200 } },
        { resources: { appearance: bytes } },
      );
      images.push(
        `placing image ${i + 1} (${mb(bytes.byteLength).trim()} PNG): ${ms(performance.now() - t0).trim()}`,
      );
      if (i === 0) await stage('+ 1 large image (3000x2000)');
    }
    await stage('+ 4 large images');

    console.log(
      [`\nSave point cost, ${prefer} (median of ${ROUNDS})`, ...rows, '', ...images].join('\n'),
    );
    await doc.close();
    expect(rows.length).toBe(5);
  });
});
