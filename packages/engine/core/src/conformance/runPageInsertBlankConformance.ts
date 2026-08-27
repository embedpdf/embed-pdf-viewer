import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { PAGE_INSERT_BLANK_MAX_COUNT } from '../mutation/PageInsertBlankInput';

/** An on-purpose non-default size so the assertions can't pass by accident. */
const SIZE = { width: 396, height: 612 };

/**
 * Blank-page insert conformance. `pages.insertBlank` is a REQUIRED member —
 * the suite runs unconditionally on every engine (no fixture bytes are
 * needed at all, which is the point of the verb), so an implementation that
 * loses the verb fails loudly instead of being skipped past.
 *
 * Invariants:
 *   1. `count` blank pages of exactly `size` appear at `destIndex` (omitted
 *      → append), rotation 0; the result lists their fresh PONs in insertion
 *      order and they agree with the returned layout.
 *   2. Pre-existing pages keep their identity: same PONs before and after,
 *      in the expected positions (an insert never invalidates neighbours).
 *   3. The mutation persists through save → re-open (bytes engines only).
 *   4. Non-positive size / count outside [1, PAGE_INSERT_BLANK_MAX_COUNT] /
 *      out-of-range destIndex reject with InvalidArg, leaving the document
 *      untouched.
 */
export function runPageInsertBlankConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page insert-blank conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('appends one blank page of the requested size with a fresh PON', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        const beforePons = before.pages.map((p) => p.pageObjectNumber);

        const result = await doc.pages.insertBlank({ size: SIZE });
        expect(result.insertedPageObjectNumbers.length).toBe(1);
        expect(result.layout.pageCount).toBe(before.pageCount + 1);
        // Existing pages: same identity, same leading positions.
        expect(
          result.layout.pages.slice(0, before.pageCount).map((p) => p.pageObjectNumber),
        ).toEqual(beforePons);
        // The appended page is a FRESH object number at the tail.
        const newPon = result.insertedPageObjectNumbers[0];
        expect(beforePons.includes(newPon)).toBe(false);
        const appended = result.layout.pages[before.pageCount];
        expect(appended.pageObjectNumber).toBe(newPon);
        expect(appended.size).toEqual(SIZE);
        expect(appended.rotation).toBe(0);
      } finally {
        await doc.close();
      }
    });

    test('destIndex + count places the blank block mid-document', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        if (before.pages.length < 2) return;
        const beforePons = before.pages.map((p) => p.pageObjectNumber);

        const result = await doc.pages.insertBlank({ size: SIZE, count: 2 }, 1);
        expect(result.insertedPageObjectNumbers.length).toBe(2);
        expect(result.insertedPageObjectNumbers[0] === result.insertedPageObjectNumbers[1]).toBe(
          false,
        );
        const pons = result.layout.pages.map((p) => p.pageObjectNumber);
        expect(pons[0]).toBe(beforePons[0]);
        expect(pons.slice(1, 3)).toEqual(result.insertedPageObjectNumbers);
        expect(pons.slice(3)).toEqual(beforePons.slice(1));
        expect(result.layout.pages[1].size).toEqual(SIZE);
        expect(result.layout.pages[2].size).toEqual(SIZE);
      } finally {
        await doc.close();
      }
    });

    test('the blank pages persist through save → re-open', async () => {
      if (opts.openKind !== 'bytes') return;
      const doc = await openFixture(engine, opts);
      let reopened: DocumentHandle | null = null;
      try {
        const before = await doc.pages.list();
        await doc.pages.insertBlank({ size: SIZE });
        const bytes = await doc.download();

        reopened = await engine.open({
          kind: 'bytes',
          id: `${opts.fixture.id}-insert-blank-reopen`,
          bytes,
        });
        const after = await reopened.pages.list();
        expect(after.pageCount).toBe(before.pageCount + 1);
        const tail = after.pages[after.pageCount - 1];
        expect(Math.round(tail.size.width)).toBe(SIZE.width);
        expect(Math.round(tail.size.height)).toBe(SIZE.height);
      } finally {
        if (reopened) await reopened.close();
        await doc.close();
      }
    });

    test('non-positive size, bad count, and out-of-range destIndex reject with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        const rejects: Array<() => Promise<unknown>> = [
          () => doc.pages.insertBlank({ size: { width: 0, height: 612 } }),
          () => doc.pages.insertBlank({ size: { width: 396, height: -10 } }),
          () => doc.pages.insertBlank({ size: SIZE, count: 0 }),
          () => doc.pages.insertBlank({ size: SIZE, count: PAGE_INSERT_BLANK_MAX_COUNT + 1 }),
          () => doc.pages.insertBlank({ size: SIZE }, before.pageCount + 1),
        ];
        for (const attempt of rejects) {
          let caught: unknown;
          try {
            await attempt();
          } catch (err) {
            caught = err;
          }
          expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
        }

        // Untouched after every rejection.
        const list = await doc.pages.list();
        expect(list.pageCount).toBe(before.pageCount);
        expect(list.pages.map((p) => p.pageObjectNumber)).toEqual(
          before.pages.map((p) => p.pageObjectNumber),
        );
      } finally {
        await doc.close();
      }
    });
  });
}

async function openFixture(engine: Engine, opts: ConformanceOptions): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
