import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
import type { AnnotationPatch, HighlightDraft } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { AbortError } from '../promise/AbortError';
import { PageListSnapshotSchema, PageMoveResultSchema } from '../wire/schemas';

/**
 * Per-fixture knowledge for the page-reorder suite. The test pages must
 * be addressable by indirect `pageObjectNumber` (every page in our
 * fixtures is). The fixture is expected to have at least 3 pages so the
 * harness can exercise reorder permutations meaningfully.
 */
export interface PageReorderConformanceFixture extends ConformanceFixture {
  /** Stable, durable PONs of (at least) three distinct pages. Order
   *  here is the *intended caller-visible* order, not the on-disk
   *  order; the suite reads `pages.list()` first and works in document
   *  order. */
  ponsForReorderTest?: number[];
  /**
   * Page used for the weak-ref-survival assertion. Defaults to the
   * first PON in `ponsForReorderTest`. The fixture page must already
   * have at least one weak annotation (no /NM, direct object) so the
   * harness can capture an `index`-kind ref before the page move and
   * re-use it after.
   */
  weakRefHostPon?: number;
  /** Quad to use for the `create()` step that produces a stable ref
   *  the suite uses. */
  createQuad?: HighlightDraft['quadPoints'];
}

export interface PageReorderConformanceOptions extends Omit<ConformanceOptions, 'fixture'> {
  fixture: PageReorderConformanceFixture;
}

const DEFAULT_QUAD: HighlightDraft['quadPoints'] = [
  {
    p1: { x: 50, y: 100 },
    p2: { x: 150, y: 100 },
    p3: { x: 50, y: 80 },
    p4: { x: 150, y: 80 },
  },
];

/**
 * Page reorder conformance suite. Verifies the architectural invariants
 * locked with the user, do NOT loosen these without re-reading
 * `PageMoveResult` and `DocumentPagesMutator`:
 *
 *   1. `pages.list()` returns every page in display order, addressed
 *      by indirect `pageObjectNumber`.
 *   2. `pages.move()` returns the full new order + geometry via
 *      `result.layout` (the same shape `pages.list()` returns). There is
 *      no document-level revision; the wire never asks the caller for one.
 *   3. Index-based annotation refs survive a page reorder. This is the
 *      whole reason per-page revisions stay put across a move: a user
 *      shuffling pages mid-edit must not lose a pending highlight. (The
 *      "move never bumps a RevisionToken" invariant is asserted directly
 *      in the annotation mutation suite, where revision liveness lives.)
 *   4. Invalid inputs (duplicate PONs, unknown PONs, out-of-range
 *      `destIndex`) reject with `InvalidArg`.
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
  const quad = fix.createQuad ?? DEFAULT_QUAD;

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
          // Pages are durable by construction; PON > 0.
          expect(list.pages[i].pageObjectNumber > 0).toBe(true);
        }

        // PONs are unique across the document.
        const seen = new Set<number>();
        for (const p of list.pages) {
          expect(seen.has(p.pageObjectNumber)).toBe(false);
          seen.add(p.pageObjectNumber);
        }
      } finally {
        await doc.close();
      }
    });

    test('pages.move() reorders pages and returns the full post-move order', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        if (before.pages.length < 3) return;
        const pons = pickReorderPons(
          before.pages.map((p) => p.pageObjectNumber),
          fix,
        );
        if (!pons) return;

        // Move the LAST of the three to the FRONT.
        const target = pons[pons.length - 1];
        const result = await doc.pages.move([target], 0);
        expect(PageMoveResultSchema.safeParse(result).success).toBe(true);

        // The result carries the new geometry: same count, contiguous
        // indices, moved page leads.
        const after = result.layout;
        expect(after.pages.length).toBe(before.pages.length);
        expect(after.pages[0].pageObjectNumber).toBe(target);
        for (let i = 0; i < after.pages.length; i++) {
          expect(after.pages[i].index).toBe(i);
        }

        // Set of PONs is preserved (no page lost or fabricated).
        const beforePons = new Set(before.pages.map((p) => p.pageObjectNumber));
        const afterPons = new Set(after.pages.map((p) => p.pageObjectNumber));
        expect(beforePons.size).toBe(afterPons.size);
        for (const pon of beforePons) expect(afterPons.has(pon)).toBe(true);

        // A subsequent `pages.list()` agrees with the returned layout
        // (the move result is not a one-off view).
        const relisted = await doc.pages.list();
        expect(relisted.pages.map((p) => p.pageObjectNumber)).toEqual(
          after.pages.map((p) => p.pageObjectNumber),
        );
      } finally {
        await doc.close();
      }
    });

    test('weak index-based annotation refs survive a page reorder', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 2) return;

        // Pick a host page and create a fresh annotation we can address
        // by index after the move. The created annotation is durable
        // (so we use its index ref via FPDFPage_GetAnnot, which yields
        // a working index-style ref bound to the current revision).
        const hostPon = fix.weakRefHostPon ?? list.pages[0].pageObjectNumber;
        const hostPage = doc.page(hostPon);
        const beforePageList = await hostPage.annotations.list();

        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'page-reorder survives this',
          quadPoints: quad,
        };
        const created = await hostPage.annotations.create(draft);

        // Capture the *post-create* page state. Neither create
        // (append-only, non-invalidating) nor pages.move bumps the
        // host page's revision, so the revision we capture here is
        // the same one a fresh `list()` would return after the move.
        // We bind the index ref to that revision and use it as a
        // weak ref across the page reorder.
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

        // Move some OTHER page (not the host page) to the front. The
        // host page's revision must stay put.
        const otherPon = list.pages.find((p) => p.pageObjectNumber !== hostPon)?.pageObjectNumber;
        if (otherPon === undefined) return;
        await doc.pages.move([otherPon], 0);

        // Use the captured weak-style ref to update the annotation.
        // This is the locked invariant: per-page RevisionToken survives
        // a page reorder, so an index ref captured before the move
        // remains valid after.
        const patch: AnnotationPatch = {
          subtype: 'highlight',
          contents: 'still alive',
        };
        const update = await hostPage.annotations.update(indexRef, patch);
        expect(update.updated.contents).toBe('still alive');

        // Also: the annotation index inside the host page is unchanged
        // (the host page's /Annots array was never touched).
        const afterMove = await hostPage.annotations.list();
        expect(afterMove.annotations.length).toBe(beforePageList.annotations.length + 1);
      } finally {
        await doc.close();
      }
    });

    test('pages.move() rejects duplicate PONs with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 1) return;
        const target = list.pages[0].pageObjectNumber;
        let caught: unknown;
        try {
          await doc.pages.move([target, target], 0);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('pages.move() rejects out-of-range destIndex with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 1) return;
        const target = list.pages[0].pageObjectNumber;
        let caught: unknown;
        try {
          // Post-removal count is `pages.length - 1`; destIndex one past that
          // is out of range.
          await doc.pages.move([target], list.pages.length);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('pages.move() rejects unknown PON with NotFound or InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        // Pick a PON that is guaranteed to not exist.
        let bogus = 0;
        for (const p of list.pages) bogus = Math.max(bogus, p.pageObjectNumber);
        bogus += 9999;

        let caught: unknown;
        try {
          await doc.pages.move([bogus], 0);
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

    test('abort on pages.move() rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 1) return;
        const target = list.pages[0].pageObjectNumber;
        const p = doc.pages.move([target], 0);
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
 * Choose three PONs to exercise reorder operations against. Prefers
 * the fixture-supplied ones, falls back to "first three in document
 * order" otherwise.
 */
function pickReorderPons(
  documentPons: number[],
  fix: PageReorderConformanceFixture,
): number[] | null {
  if (fix.ponsForReorderTest && fix.ponsForReorderTest.length >= 3) {
    return fix.ponsForReorderTest.slice(0, 3);
  }
  if (documentPons.length < 3) return null;
  return documentPons.slice(0, 3);
}
