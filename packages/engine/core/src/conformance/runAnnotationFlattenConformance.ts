import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { SquareDraft } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { AnnotationFlattenResultSchema } from '../wire/schemas';

const square = (left: number, bottom: number): SquareDraft => ({
  subtype: 'square',
  rect: { left, bottom, right: left + 40, top: bottom + 40 },
  color: { r: 20, g: 40, b: 220 },
  strokeWidth: 2,
});

/**
 * Selective annotation flatten: `page(pon).annotations.flatten(refs)` is
 * `pages.flatten` for a chosen set. Locks, on every engine:
 *   1. only the given refs are painted and removed; the rest of the page's
 *      annotations are untouched;
 *   2. per-ref status (`applied` / `skipped`), one `annotations.flattened`
 *      event, a `meta` with that page's new pins, layout unchanged;
 *   3. a hidden ref is `skipped`; a ref on another page rejects `InvalidArg`
 *      with nothing mutated.
 * Skips cleanly when the engine does not implement the optional member.
 */
export function runAnnotationFlattenConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation flatten conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('flattens exactly the given refs and reports per-ref status', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const layoutBefore = await doc.pages.list();
        const pon = layoutBefore.pages[0].pageObjectNumber;
        const page = doc.page(pon);
        if (!page.annotations.flatten) return;

        const a = (await page.annotations.create(square(20, 20))).created.ref;
        const b = (await page.annotations.create(square(80, 20))).created.ref;
        const c = (await page.annotations.create(square(140, 20))).created.ref;
        // Hide `c` — ineligible for display flatten, so it must be skipped.
        await page.annotations.update(c, { subtype: 'square', flags: { hidden: true } });
        const before = await page.annotations.list();

        const events: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => {
          if (event.type === 'annotations.flattened') events.push(event);
        });
        const result = await page.annotations.flatten([a, c], 'display');
        unsubscribe();

        expect(AnnotationFlattenResultSchema.safeParse(result).success).toBe(true);
        expect(result.pageObjectNumber).toBe(pon);
        expect(result.usage).toBe('display');
        expect(result.results.map((item) => item.status)).toEqual(['applied', 'skipped']);
        expect(result.meta === null).toBe(false);
        expect(events).toHaveLength(1);

        // Layout untouched; `a` gone, `b` and `c` still there.
        expect(await doc.pages.list()).toEqual(layoutBefore);
        const after = await page.annotations.list();
        expect(after.annotations.length).toBe(before.annotations.length - 1);
        expect(after.annotations.some((dto) => sameRef(dto.ref, b))).toBe(true);
        expect(after.annotations.some((dto) => sameRef(dto.ref, c))).toBe(true);
        expect(after.annotations.some((dto) => sameRef(dto.ref, a))).toBe(false);
        expect(after.pageState.revision.generation > before.pageState.revision.generation).toBe(
          true,
        );
      } finally {
        await doc.close();
      }
    });

    test('a ref on another page rejects InvalidArg and mutates nothing', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const layout = await doc.pages.list();
        if (layout.pages.length < 2) return;
        const page0 = doc.page(layout.pages[0].pageObjectNumber);
        const page1 = doc.page(layout.pages[1].pageObjectNumber);
        if (!page0.annotations.flatten) return;
        const own = (await page0.annotations.create(square(20, 100))).created.ref;
        const foreign = (await page1.annotations.create(square(20, 100))).created.ref;
        const countBefore = (await page0.annotations.list()).annotations.length;

        await expect(page0.annotations.flatten([own, foreign])).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
        expect((await page0.annotations.list()).annotations.length).toBe(countBefore);
      } finally {
        await doc.close();
      }
    });

    test('an empty ref list rejects InvalidArg; an unknown ref rejects', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const pon = (await doc.pages.list()).pages[0].pageObjectNumber;
        const page = doc.page(pon);
        if (!page.annotations.flatten) return;
        await expect(page.annotations.flatten([])).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
        let unknown: unknown = null;
        try {
          await page.annotations.flatten([
            { kind: 'objectNumber', pageObjectNumber: pon, annotObjectNumber: 987654321 },
          ]);
        } catch (error) {
          unknown = error;
        }
        expect(
          EngineError.is(unknown, EngineErrorCode.NotFound) ||
            EngineError.is(unknown, EngineErrorCode.InvalidArg) ||
            EngineError.is(unknown, EngineErrorCode.InvalidReference),
        ).toBe(true);
      } finally {
        await doc.close();
      }
    });
  });
}

function sameRef(left: AnnotationRef, right: AnnotationRef): boolean {
  if (left.kind === 'objectNumber' && right.kind === 'objectNumber') {
    return left.annotObjectNumber === right.annotObjectNumber;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

async function openFixture(engine: Engine, opts: ConformanceOptions): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes: await opts.fixture.bytes() });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
