import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { toPageRef } from '../identity/PageRef';

/**
 * Page insert conformance. `pages.insert` is a required member — this suite
 * runs unconditionally on every engine, so an implementation that loses the
 * verb fails loudly instead of being skipped past.
 *
 * Invariants:
 *   1. Every page of the source bytes is copied in at `toIndex` (omitted →
 *      append), in source order; the result lists the fresh page object numbers in
 *      insertion order and they agree with the returned layout.
 *   2. Pre-existing pages keep their identity: same page object numbers before and after,
 *      in the expected positions (an insert never invalidates neighbours).
 *   3. The mutation persists through save → re-open (bytes engines only).
 *   4. Empty bytes / malformed bytes / out-of-range toIndex reject with
 *      InvalidArg / MalformedPdf, leaving the document untouched.
 */
export function runPageInsertConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page insert conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('appends every source page with fresh PONs; existing pages keep identity', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        const beforePageObjectNumbers = before.pages.map((p) => p.ref.pageObjectNumber);
        // Self-source: extract the first page, insert it back (append).
        const single = await doc.pages.extract([toPageRef(beforePageObjectNumbers[0])]);

        const result = await doc.pages.insert(single);
        expect(result.insertedPages.length).toBe(1);
        expect(result.layout.pageCount).toBe(before.pageCount + 1);
        // Existing pages: same identity, same leading positions.
        expect(
          result.layout.pages.slice(0, before.pageCount).map((p) => p.ref.pageObjectNumber),
        ).toEqual(beforePageObjectNumbers);
        // The appended copy is a fresh object number at the tail.
        const newPageObjectNumber = result.insertedPages[0].pageObjectNumber;
        expect(beforePageObjectNumbers.includes(newPageObjectNumber)).toBe(false);
        expect(result.layout.pages[before.pageCount].ref.pageObjectNumber).toBe(
          newPageObjectNumber,
        );
        // The copy inherits the source page's geometry.
        expect(result.layout.pages[before.pageCount].size).toEqual(before.pages[0].size);
      } finally {
        await doc.close();
      }
    });

    test('toIndex places the block mid-document, in source order', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        if (before.pages.length < 2) return;
        const beforePageObjectNumbers = before.pages.map((p) => p.ref.pageObjectNumber);
        const two = await doc.pages.extract([
          toPageRef(beforePageObjectNumbers[0]),
          toPageRef(beforePageObjectNumbers[1]),
        ]);

        const result = await doc.pages.insert(two, 1);
        expect(result.insertedPages.length).toBe(2);
        const pageObjectNumbers = result.layout.pages.map((p) => p.ref.pageObjectNumber);
        expect(pageObjectNumbers[0]).toBe(beforePageObjectNumbers[0]);
        expect(pageObjectNumbers.slice(1, 3)).toEqual(
          result.insertedPages.map((p) => p.pageObjectNumber),
        );
        expect(pageObjectNumbers.slice(3)).toEqual(beforePageObjectNumbers.slice(1));
      } finally {
        await doc.close();
      }
    });

    test('the inserted pages persist through save → re-open', async () => {
      if (opts.openKind !== 'bytes') return;
      const doc = await openFixture(engine, opts);
      let reopened: DocumentHandle | null = null;
      try {
        const before = await doc.pages.list();
        const single = await doc.pages.extract([before.pages[0].ref]);
        await doc.pages.insert(single);
        const bytes = await doc.download();

        reopened = await engine.open({
          kind: 'bytes',
          id: `${opts.fixture.id}-insert-reopen`,
          bytes,
        });
        const after = await reopened.pages.list();
        expect(after.pageCount).toBe(before.pageCount + 1);
      } finally {
        if (reopened) await reopened.close();
        await doc.close();
      }
    });

    test('empty bytes reject with InvalidArg; garbage rejects with MalformedPdf', async () => {
      const doc = await openFixture(engine, opts);
      try {
        let caught: unknown;
        try {
          await doc.pages.insert(new Uint8Array(0));
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);

        caught = undefined;
        try {
          await doc.pages.insert(new TextEncoder().encode('not a pdf at all'));
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.MalformedPdf)).toBe(true);

        // Untouched after both rejections.
        const list = await doc.pages.list();
        expect(list.pageCount > 0).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('out-of-range toIndex rejects with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        const single = await doc.pages.extract([before.pages[0].ref]);
        let caught: unknown;
        try {
          await doc.pages.insert(single, before.pageCount + 1);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
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
