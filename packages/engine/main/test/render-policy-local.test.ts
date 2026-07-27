import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  EngineError,
  EngineErrorCode,
  type DocumentHandle,
  type EngineRenderPolicy,
} from '@embedpdf/engine-core/runtime';
import { createLocalEngine, type LocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const annotatedPath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'ebook-annotated.pdf',
);

/**
 * `localEngine({ renderPolicy })` — the deployment policy plane on the
 * LOCAL engine (SCALE-OUT §2.1b): advertisement via `render.policy()`,
 * off-lattice rejection under `enforced: true` (server parity), and the
 * `maxRenderPixels` budget riding into every worker render.
 */
describe('local render policy (wasm runtime)', () => {
  const LATTICE: EngineRenderPolicy = {
    kind: 'lattice',
    fullPage: { widths: [320, 640] },
    appearances: { scales: [1, 2, 4] },
    maxRenderPixels: 4_000_000,
    formats: ['webp'],
    background: 'white',
    enforced: true,
  };

  let bytes: Uint8Array;
  let engine: LocalEngine;
  let doc: DocumentHandle;

  beforeAll(async () => {
    bytes = new Uint8Array(await readFile(annotatedPath));
    engine = createLocalEngine({ runtime: { prefer: 'wasm' }, renderPolicy: LATTICE });
    doc = await engine.open({ kind: 'bytes', id: 'policy-doc', bytes });
  }, 120_000);

  afterAll(async () => {
    await doc?.close();
    await engine?.destroy();
  });

  test('policy() advertises the configured lattice verbatim', async () => {
    expect(await doc.render.policy()).toEqual(LATTICE);
  });

  test('default engine stays continuous', async () => {
    const plain = createLocalEngine({ runtime: { prefer: 'wasm' } });
    const plainDoc = await plain.open({ kind: 'bytes', id: 'plain-doc', bytes });
    try {
      expect(await plainDoc.render.policy()).toEqual({ kind: 'continuous' });
      // …and renders anything, including the scale viewport the enforced
      // lattice rejects below.
      const raster = await plainDoc
        .page(await firstPon(plainDoc))
        .render.raw({ viewport: { kind: 'scale', scale: 0.25 } });
      expect(raster.width).toBeGreaterThan(0);
    } finally {
      await plainDoc.close();
      await plain.destroy();
    }
  }, 120_000);

  test('enforced: off-lattice full-page renders reject with the policy attached', async () => {
    const page = doc.page(await firstPon(doc));

    // Scale viewports are off the width lattice by construction — the
    // caller must convert through snapFullPageViewport(pageWidth).
    await expect(page.render.raw({ viewport: { kind: 'scale', scale: 1 } })).rejects.toSatisfy(
      (err: unknown) => {
        expect(EngineError.is(err, EngineErrorCode.InvalidArg)).toBe(true);
        expect((err as EngineError).message).toContain('off the deployment lattice');
        expect(
          ((err as EngineError).details as { renderPolicy?: EngineRenderPolicy }).renderPolicy,
        ).toEqual(LATTICE);
        return true;
      },
    );

    // Off-ladder width: same rejection.
    await expect(page.render.raw({ viewport: { kind: 'width', width: 720 } })).rejects.toSatisfy(
      (err: unknown) => EngineError.is(err, EngineErrorCode.InvalidArg),
    );

    // On-ladder width renders, at exactly the requested width.
    const raster = await page.render.raw({ viewport: { kind: 'width', width: 320 } });
    expect(raster.width).toBe(320);
  });

  test('enforced: rect targets are exempt (tile jurisdiction)', async () => {
    const page = doc.page(await firstPon(doc));
    const raster = await page.render.raw({
      target: { kind: 'rect', rect: { left: 0, bottom: 0, right: 100, top: 100 } },
      viewport: { kind: 'scale', scale: 1 },
    });
    expect(raster.width).toBeGreaterThan(0);
  });

  test('enforced: appearance scales snap-or-reject against the appearance lattice', async () => {
    // Page 2 of ebook-annotated.pdf carries annotations with /AP streams.
    const page = doc.page(2 as never);

    await expect(page.annotations.renderAppearances({ scale: 1.5 })).rejects.toSatisfy(
      (err: unknown) => {
        expect(EngineError.is(err, EngineErrorCode.InvalidArg)).toBe(true);
        expect((err as EngineError).message).toContain('snapAppearanceScale');
        return true;
      },
    );

    const result = await page.annotations.renderAppearances({ scale: 2 });
    expect(result.appearances.length).toBeGreaterThan(0);
  });

  test('the pixel budget rides into the worker and rejects before allocating', async () => {
    // A lattice whose budget is smaller than its own smallest ladder
    // width can produce: width 320 of ANY page overflows 10,000 px, so
    // the worker-side guard must fire (the lattice check passes).
    const tiny = createLocalEngine({
      runtime: { prefer: 'wasm' },
      renderPolicy: {
        kind: 'lattice',
        fullPage: { widths: [320, 640] },
        maxRenderPixels: 10_000,
        formats: ['webp'],
        background: 'white',
        enforced: true,
      },
    });
    const tinyDoc = await tiny.open({ kind: 'bytes', id: 'tiny-doc', bytes });
    try {
      await expect(
        tinyDoc
          .page(await firstPon(tinyDoc))
          .render.raw({ viewport: { kind: 'width', width: 320 } }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(EngineError.is(err, EngineErrorCode.InvalidArg)).toBe(true);
        expect((err as EngineError).message).toContain('pixel budget');
        return true;
      });
    } finally {
      await tinyDoc.close();
      await tiny.destroy();
    }
  }, 120_000);
});

async function firstPon(doc: DocumentHandle): Promise<never> {
  const pages = await doc.pages.list();
  return pages.pages[0]!.pageObjectNumber as never;
}
