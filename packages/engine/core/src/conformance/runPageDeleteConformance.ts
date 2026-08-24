import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { AnnotationPatch, HighlightDraft } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { AbortError } from '../promise/AbortError';
import { PageDeleteResultSchema } from '../wire/schemas';

const QUAD: HighlightDraft['quadPoints'] = [
  {
    p1: { x: 50, y: 100 },
    p2: { x: 150, y: 100 },
    p3: { x: 50, y: 80 },
    p4: { x: 150, y: 80 },
  },
];

/**
 * Page delete conformance suite. Verifies the architectural invariants —
 * do NOT loosen these without re-reading `PageDeleteResult`:
 *
 *   1. `pages.delete()` removes exactly the listed pages and returns the
 *      full surviving layout; a subsequent `list()` agrees.
 *   2. Deleted PONs are RETIRED: addressing a deleted page afterwards is a
 *      clean `NotFound` (an API-level error, never native-memory danger).
 *   3. SURVIVING pages keep identity and `RevisionToken`s — an index-based
 *      annotation ref on an unrelated page survives a neighbour's deletion.
 *   4. Deleting every page is rejected (`InvalidArg`) — a document keeps at
 *      least one page.
 *   5. Duplicate / unknown PONs reject with `InvalidArg` / `NotFound`;
 *      abort propagates as `AbortError`.
 *
 * Both local (worker host + WASM) and cloud (HTTP + @cloudpdf/server)
 * implementations must pass identically.
 */
export function runPageDeleteConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page delete conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('pages.delete() removes the page and returns the surviving layout', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        if (before.pages.length < 2) return;
        const victim = before.pages[1].pageObjectNumber;

        const result = await doc.pages.delete([victim]);
        expect(PageDeleteResultSchema.safeParse(result).success).toBe(true);

        const after = result.layout;
        expect(after.pages.length).toBe(before.pages.length - 1);
        expect(after.pageCount).toBe(before.pageCount - 1);
        expect(after.pages.some((p) => p.pageObjectNumber === victim)).toBe(false);

        // Survivors keep their relative order, contiguous 0..N-1 indices.
        const expectedOrder = before.pages
          .map((p) => p.pageObjectNumber)
          .filter((pon) => pon !== victim);
        expect(after.pages.map((p) => p.pageObjectNumber)).toEqual(expectedOrder);
        for (let i = 0; i < after.pages.length; i++) {
          expect(after.pages[i].index).toBe(i);
        }

        // A subsequent list() agrees (the result is not a one-off view).
        const relisted = await doc.pages.list();
        expect(relisted.pages.map((p) => p.pageObjectNumber)).toEqual(expectedOrder);
      } finally {
        await doc.close();
      }
    });

    test('addressing a deleted page afterwards is a clean NotFound', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        if (before.pages.length < 2) return;
        const victim = before.pages[1].pageObjectNumber;
        await doc.pages.delete([victim]);

        let caught: unknown;
        try {
          await doc.page(victim).annotations.list();
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.NotFound)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('surviving pages keep their weak index-based annotation refs', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 2) return;

        const hostPon = list.pages[0].pageObjectNumber;
        const victimPon = list.pages[1].pageObjectNumber;
        const hostPage = doc.page(hostPon);

        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'neighbour deletion survives this',
          quadPoints: QUAD,
        };
        const created = await hostPage.annotations.create(draft);
        const afterCreate = await hostPage.annotations.list();
        const targetIndex = afterCreate.annotations.findIndex(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            created.created.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === created.created.ref.annotObjectNumber,
        );
        expect(targetIndex >= 0).toBe(true);

        const indexRef: AnnotationRef = {
          kind: 'index',
          pageObjectNumber: hostPon,
          index: targetIndex,
          revision: afterCreate.pageState.revision,
        };

        await doc.pages.delete([victimPon]);

        const patch: AnnotationPatch = { subtype: 'highlight', contents: 'still alive' };
        const update = await hostPage.annotations.update(indexRef, patch);
        expect(update.updated.contents).toBe('still alive');
      } finally {
        await doc.close();
      }
    });

    test('deleting EVERY page is rejected with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        let caught: unknown;
        try {
          await doc.pages.delete(list.pages.map((p) => p.pageObjectNumber));
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('pages.delete() rejects duplicate PONs with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const pon = list.pages[0].pageObjectNumber;
        let caught: unknown;
        try {
          await doc.pages.delete([pon, pon]);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('pages.delete() rejects unknown PON with NotFound or InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        let bogus = 0;
        for (const p of list.pages) bogus = Math.max(bogus, p.pageObjectNumber);
        bogus += 9999;

        let caught: unknown;
        try {
          await doc.pages.delete([bogus]);
        } catch (err) {
          caught = err;
        }
        expect(
          EngineError.is(caught, EngineErrorCode.NotFound) ||
            EngineError.is(caught, EngineErrorCode.InvalidArg),
        ).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('abort on pages.delete() rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 2) return;
        const pon = list.pages[1].pageObjectNumber;
        const p = doc.pages.delete([pon]);
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
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
