import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * Page insert conformance. `pages.insert?` is optional only until the cloud
 * endpoint ships (it is slated REQUIRED-parity — a cloud viewer must be able
 * to add pages); the suite runs wherever the implementation exists.
 *
 * Invariants:
 *   1. Every page of the source bytes is COPIED in at `destIndex` (omitted →
 *      append), in source order; the result lists the fresh PONs in
 *      insertion order and they agree with the returned layout.
 *   2. Pre-existing pages keep their identity: same PONs before and after,
 *      in the expected positions (an insert never invalidates neighbours).
 *   3. The mutation persists through save → re-open (bytes engines only).
 *   4. Empty bytes / malformed bytes / out-of-range destIndex reject with
 *      InvalidArg / MalformedPdf, leaving the document untouched.
 */
export function runPageInsertConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page insert conformance: ${opts.label}`, () => {
    let engine: Engine;
    let supported = false;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      const probe = await openFixture(engine, opts);
      supported = probe.pages.insert !== undefined && probe.pages.extract !== undefined;
      await probe.close();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('appends every source page with fresh PONs; existing pages keep identity', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        const beforePons = before.pages.map((p) => p.pageObjectNumber);
        // Self-source: extract the first page, insert it back (append).
        const single = await doc.pages.extract!([beforePons[0]]);

        const result = await doc.pages.insert!(single);
        expect(result.insertedPageObjectNumbers.length).toBe(1);
        expect(result.layout.pageCount).toBe(before.pageCount + 1);
        // Existing pages: same identity, same leading positions.
        expect(
          result.layout.pages.slice(0, before.pageCount).map((p) => p.pageObjectNumber),
        ).toEqual(beforePons);
        // The appended copy is a FRESH object number at the tail.
        const newPon = result.insertedPageObjectNumbers[0];
        expect(beforePons.includes(newPon)).toBe(false);
        expect(result.layout.pages[before.pageCount].pageObjectNumber).toBe(newPon);
        // The copy inherits the source page's geometry.
        expect(result.layout.pages[before.pageCount].size).toEqual(before.pages[0].size);
      } finally {
        await doc.close();
      }
    });

    test('destIndex places the block mid-document, in source order', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        if (before.pages.length < 2) return;
        const beforePons = before.pages.map((p) => p.pageObjectNumber);
        const two = await doc.pages.extract!([beforePons[0], beforePons[1]]);

        const result = await doc.pages.insert!(two, 1);
        expect(result.insertedPageObjectNumbers.length).toBe(2);
        const pons = result.layout.pages.map((p) => p.pageObjectNumber);
        expect(pons[0]).toBe(beforePons[0]);
        expect(pons.slice(1, 3)).toEqual(result.insertedPageObjectNumbers);
        expect(pons.slice(3)).toEqual(beforePons.slice(1));
      } finally {
        await doc.close();
      }
    });

    test('the inserted pages persist through save → re-open', async () => {
      if (!supported || opts.openKind !== 'bytes') return;
      const doc = await openFixture(engine, opts);
      let reopened: DocumentHandle | null = null;
      try {
        const before = await doc.pages.list();
        const single = await doc.pages.extract!([before.pages[0].pageObjectNumber]);
        await doc.pages.insert!(single);
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
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        let caught: unknown;
        try {
          await doc.pages.insert!(new Uint8Array(0));
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);

        caught = undefined;
        try {
          await doc.pages.insert!(new TextEncoder().encode('not a pdf at all'));
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

    test('out-of-range destIndex rejects with InvalidArg', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        const single = await doc.pages.extract!([before.pages[0].pageObjectNumber]);
        let caught: unknown;
        try {
          await doc.pages.insert!(single, before.pageCount + 1);
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
