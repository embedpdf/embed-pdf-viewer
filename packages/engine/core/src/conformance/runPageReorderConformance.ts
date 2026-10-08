import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { annotationKey } from '../identity/annotationKey';
import { toPageRef } from '../identity/PageRef';
import { AbortError } from '../promise/AbortError';
import { PageListSnapshotSchema, PageReorderResultSchema } from '../wire/schemas';

/**
 * Per-fixture knowledge for the page-reorder suite. The test pages must
 * be addressable by indirect `pageObjectNumber` (every page in our
 * fixtures is). The fixture is expected to have at least 3 pages so the
 * harness can exercise reorder permutations meaningfully.
 */
export interface PageReorderConformanceFixture extends ConformanceFixture {
  /** Stable, durable page object numbers of (at least) three distinct pages. Order
   *  here is the *intended caller-visible* order, not the on-disk
   *  order; the suite reads `pages.list()` first and works in document
   *  order. */
  pageObjectNumbersForReorderTest?: number[];
}

export interface PageReorderConformanceOptions extends Omit<ConformanceOptions, 'fixture'> {
  fixture: PageReorderConformanceFixture;
}

/**
 * Page reorder conformance suite. Verifies the architectural invariants
 * locked with the user, do not loosen these without re-reading
 * `PageReorderResult` and `DocumentPagesMutator`:
 *
 *   1. `pages.list()` returns every page in display order, addressed
 *      by indirect `pageObjectNumber`.
 *   2. `pages.reorder()` puts the pages next to a neighbour (or at the start
 *      or end) and returns the full new order + geometry via
 *      `result.layout` (the same shape `pages.list()` returns). There is
 *      no document-level revision; the wire never asks the caller for one.
 *   3. Annotation names survive a page reorder: a user shuffling pages
 *      mid-edit must not lose a pending highlight, so a `baseIndex` ref
 *      captured before the reorder works after it.
 *   4. A page named twice, or a neighbour that is one of the moved pages,
 *      rejects with `InvalidArg`; an unknown page or neighbour with
 *      `NotFound`.
 *   5. Abort propagates as `AbortError`.
 *
 * Both local (worker host + WASM) and cloud (HTTP + @cloudpdf/server)
 * implementations must pass identically.
 */
export function runPageReorderConformance(
  runner: ConformanceTestRunner,
  opts: PageReorderConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;
  const fix = opts.fixture;

  describe(`page reorder conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('pages.list() returns every page in display order, durable PONs only', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        expect(PageListSnapshotSchema.safeParse(list).success).toBe(true);
        expect(list.pages.length >= 1).toBe(true);

        for (let i = 0; i < list.pages.length; i++) {
          // Strictly contiguous, 0..N-1.
          expect(list.pages[i].index).toBe(i);
          // Pages are durable by construction; page object number > 0.
          expect(list.pages[i].ref.objectNumber > 0).toBe(true);
        }

        // page object numbers are unique across the document.
        const seen = new Set<number>();
        for (const p of list.pages) {
          expect(seen.has(p.ref.objectNumber)).toBe(false);
          seen.add(p.ref.objectNumber);
        }
      } finally {
        await doc.close();
      }
    });

    test('pages.reorder() moves pages to a position and returns the full new order', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        if (before.pages.length < 3) return;
        const pageObjectNumbers = pickReorderPageObjectNumbers(
          before.pages.map((p) => p.ref.objectNumber),
          fix,
        );
        if (!pageObjectNumbers) return;

        // Move the last of the three to the front.
        const target = pageObjectNumbers[pageObjectNumbers.length - 1];
        const result = await doc.pages.reorder([toPageRef(target)], 'start');
        expect(PageReorderResultSchema.safeParse(result).success).toBe(true);
        expect(result.pages.map((p) => p.objectNumber)).toEqual([target]);

        // The result carries the new geometry: same count, contiguous
        // indices, moved page leads.
        const after = result.layout;
        expect(after.pages.length).toBe(before.pages.length);
        expect(after.pages[0].ref.objectNumber).toBe(target);
        for (let i = 0; i < after.pages.length; i++) {
          expect(after.pages[i].index).toBe(i);
        }

        // Set of page object numbers is preserved (no page lost or fabricated).
        const beforePageObjectNumbers = new Set(before.pages.map((p) => p.ref.objectNumber));
        const afterPageObjectNumbers = new Set(after.pages.map((p) => p.ref.objectNumber));
        expect(beforePageObjectNumbers.size).toBe(afterPageObjectNumbers.size);
        for (const pageObjectNumber of beforePageObjectNumbers)
          expect(afterPageObjectNumbers.has(pageObjectNumber)).toBe(true);

        // A subsequent `pages.list()` agrees with the returned layout
        // (the reorder result is not a one-off view).
        const relisted = await doc.pages.list();
        expect(relisted.pages.map((p) => p.ref.objectNumber)).toEqual(
          after.pages.map((p) => p.ref.objectNumber),
        );
      } finally {
        await doc.close();
      }
    });

    test('an annotation born inline keeps its baseIndex name across a page reorder', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const inline = (await doc.annotations.list()).annotations.find(
          (a) => a.ref.kind === 'baseIndex',
        );
        const other = list.pages.find((p) => p.ref.objectNumber !== inline?.page.objectNumber);
        if (!inline || !other) return;

        await doc.pages.reorder([other.ref], 'start');

        const update = await doc.page(inline.page).annotations.update(inline.ref, {
          contents: 'still alive',
        });
        expect(update.annotation.contents).toBe('still alive');
        expect(annotationKey(update.annotation.ref)).toBe(annotationKey(inline.ref));
      } finally {
        await doc.close();
      }
    });

    test('pages.reorder() puts the pages right before or after their neighbour, in the order given', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        if (before.pages.length < 3) return;
        const [first, second, third] = before.pages.map((p) => p.ref);
        const order = async () => (await doc.pages.list()).pages.map((p) => p.ref.objectNumber);
        const rest = before.pages.slice(3).map((p) => p.ref.objectNumber);

        await doc.pages.reorder([third!, first!], { after: second! });
        expect(await order()).toEqual([
          second!.objectNumber,
          third!.objectNumber,
          first!.objectNumber,
          ...rest,
        ]);

        await doc.pages.reorder([first!], { before: second! });
        expect(await order()).toEqual([
          first!.objectNumber,
          second!.objectNumber,
          third!.objectNumber,
          ...rest,
        ]);

        const last = before.pages[before.pages.length - 1]!.ref;
        await doc.pages.reorder([first!], 'end');
        expect((await order()).at(-1)).toBe(first!.objectNumber);
        await doc.pages.reorder([first!], { before: second! });
        expect((await order()).at(-1)).toBe(last.objectNumber);
      } finally {
        await doc.close();
      }
    });

    test('pages.reorder() rejects duplicate PONs with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 1) return;
        const target = list.pages[0].ref;
        let caught: unknown;
        try {
          await doc.pages.reorder([target, target], 'start');
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('pages.reorder() rejects a neighbour that is one of the moved pages with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 2) return;
        const [first, second] = list.pages.map((p) => p.ref);
        let caught: unknown;
        try {
          await doc.pages.reorder([first!, second!], { after: second! });
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('pages.reorder() rejects an unknown page or neighbour with NotFound', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        // Pick a page object number that is guaranteed to not exist.
        let bogus = 0;
        for (const p of list.pages) bogus = Math.max(bogus, p.ref.objectNumber);
        bogus += 9999;

        const refused = async (attempt: () => Promise<unknown>) => {
          try {
            await attempt();
          } catch (err) {
            return err;
          }
          return undefined;
        };
        const unknownPage = await refused(() => doc.pages.reorder([toPageRef(bogus)], 'start'));
        expect(EngineError.is(unknownPage, EngineErrorCode.NotFound)).toBe(true);
        const unknownNeighbour = await refused(() =>
          doc.pages.reorder([list.pages[0]!.ref], { after: toPageRef(bogus) }),
        );
        expect(EngineError.is(unknownNeighbour, EngineErrorCode.NotFound)).toBe(true);
        expect((await doc.pages.list()).pages.map((p) => p.ref.objectNumber)).toEqual(
          list.pages.map((p) => p.ref.objectNumber),
        );
      } finally {
        await doc.close();
      }
    });

    test('abort on pages.reorder() rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 1) return;
        const target = list.pages[0].ref;
        const p = doc.pages.reorder([target], 'start');
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });
  });
}

async function openFixture(
  engine: Engine,
  opts: PageReorderConformanceOptions,
): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}

/**
 * Choose three page object numbers to exercise reorder operations against. Prefers
 * the fixture-supplied ones, falls back to "first three in document
 * order" otherwise.
 */
function pickReorderPageObjectNumbers(
  documentPageObjectNumbers: number[],
  fix: PageReorderConformanceFixture,
): number[] | null {
  if (fix.pageObjectNumbersForReorderTest && fix.pageObjectNumbersForReorderTest.length >= 3) {
    return fix.pageObjectNumbersForReorderTest.slice(0, 3);
  }
  if (documentPageObjectNumbers.length < 3) return null;
  return documentPageObjectNumbers.slice(0, 3);
}
