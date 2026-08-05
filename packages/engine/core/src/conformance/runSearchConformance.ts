import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { AbortError } from '../promise/AbortError';
import { foldText } from '../search/fold';
import type { SearchMatch, SearchSlice } from '../search/types';
import { SearchSliceSchema } from '../wire/schemas';

/**
 * Per-fixture expectations for the search harness. Suites supply a
 * literal known to be on a specific page, one known to be nowhere, and a
 * regex with a predictable hit — the harness asserts behavior (offsets,
 * rects, snippets, cursor mechanics, dialect rejection), never exact
 * match counts, so PDFium text-extraction tweaks don't require edits.
 */
export interface SearchConformanceFixture extends ConformanceFixture {
  /** Literal present in the document at least once. */
  presentLiteral: string;
  /** A page (pon) guaranteed to carry a `presentLiteral` match. */
  presentPageObjectNumber: number;
  /** Literal guaranteed to match nowhere. */
  absentLiteral: string;
  /** Dialect-valid regex with at least one match in the document. */
  presentRegex: string;
}

export interface SearchConformanceOptions extends Omit<ConformanceOptions, 'fixture'> {
  fixture: SearchConformanceFixture;
}

export function runSearchConformance(
  runner: ConformanceTestRunner,
  opts: SearchConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;
  const fixture = opts.fixture;

  /** Drive the cursor loop to exhaustion; assert each slice parses. */
  async function collectAll(
    doc: Awaited<ReturnType<Engine['open']>>,
    request: Parameters<typeof doc.search.query>[0],
  ): Promise<{ matches: SearchMatch[]; slices: SearchSlice[] }> {
    const matches: SearchMatch[] = [];
    const slices: SearchSlice[] = [];
    let cursor: string | undefined;
    for (;;) {
      const slice = await doc.search.query({ ...request, cursor });
      expect(SearchSliceSchema.safeParse(slice).success).toBe(true);
      matches.push(...slice.matches);
      slices.push(slice);
      if (slice.nextCursor === null) return { matches, slices };
      cursor = slice.nextCursor;
    }
  }

  describe(`search conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('finds the present literal with sane matches', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const { matches } = await collectAll(doc, {
          query: { text: fixture.presentLiteral },
        });
        expect(matches.length > 0).toBe(true);
        expect(matches.some((m) => m.pageObjectNumber === fixture.presentPageObjectNumber)).toBe(
          true,
        );
        for (const m of matches) {
          expect(m.charCount > 0).toBe(true);
          expect(m.rects.length > 0).toBe(true);
          for (const r of m.rects) {
            expect(r.right > r.left).toBe(true);
            expect(r.top > r.bottom).toBe(true);
          }
        }
      } finally {
        await doc.close();
      }
    });

    test('matching is case-insensitive by default', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const lower = await collectAll(doc, {
          query: { text: fixture.presentLiteral.toLowerCase() },
        });
        const upper = await collectAll(doc, {
          query: { text: fixture.presentLiteral.toUpperCase() },
        });
        expect(lower.matches.length).toBe(upper.matches.length);
        expect(lower.matches.length > 0).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test("'full' snippets reproduce the matched text; 'rects' carries none", async () => {
      const doc = await openFixture(engine, opts);
      try {
        const full = await collectAll(doc, {
          query: { text: fixture.presentLiteral },
          mode: 'full',
        });
        for (const m of full.matches) {
          expect(!!m.snippet).toBe(true);
          const s = m.snippet!;
          const hit = s.text.slice(s.matchStart, s.matchStart + s.matchLength);
          // Fold both sides: the snippet keeps the page's original case
          // and (1:1-flattened) whitespace.
          expect(foldText(hit).folded).toBe(foldText(fixture.presentLiteral).folded);
        }
        const rects = await collectAll(doc, {
          query: { text: fixture.presentLiteral },
          mode: 'rects',
        });
        expect(rects.matches.length).toBe(full.matches.length);
        for (const m of rects.matches) expect(m.snippet === undefined).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('the absent literal exhausts with zero matches', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const { matches, slices } = await collectAll(doc, {
          query: { text: fixture.absentLiteral },
        });
        expect(matches.length).toBe(0);
        const last = slices[slices.length - 1];
        expect(last.nextCursor).toBe(null);
        expect(last.totalPages > 0).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('a one-page budget walks the whole document via the cursor', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const whole = await collectAll(doc, {
          query: { text: fixture.presentLiteral },
        });
        const sliced = await collectAll(doc, {
          query: { text: fixture.presentLiteral },
          budget: { maxPages: 1 },
        });
        expect(sliced.matches.length).toBe(whole.matches.length);
        const last = sliced.slices[sliced.slices.length - 1];
        expect(last.scannedPages).toBe(last.totalPages);
        expect(sliced.slices.length).toBe(last.totalPages);
      } finally {
        await doc.close();
      }
    });

    test('startPage rotates the scan order (viewport-first)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const slice = await doc.search.query({
          query: { text: fixture.presentLiteral },
          startPage: fixture.presentPageObjectNumber,
          budget: { maxPages: 1 },
        });
        expect(slice.matches.length > 0).toBe(true);
        expect(slice.matches[0].pageObjectNumber).toBe(fixture.presentPageObjectNumber);
      } finally {
        await doc.close();
      }
    });

    test('a cursor replayed against a different query is rejected', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const first = await doc.search.query({
          query: { text: fixture.presentLiteral },
          budget: { maxPages: 1 },
        });
        expect(first.nextCursor !== null).toBe(true);
        let caught: unknown;
        try {
          await doc.search.query({
            query: { text: fixture.absentLiteral },
            cursor: first.nextCursor!,
          });
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('a malformed cursor is rejected', async () => {
      const doc = await openFixture(engine, opts);
      try {
        let caught: unknown;
        try {
          await doc.search.query({
            query: { text: fixture.presentLiteral },
            cursor: 'not a cursor',
          });
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('regex queries match with offsets and rects', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const { matches } = await collectAll(doc, {
          query: { text: fixture.presentRegex, regex: true },
        });
        expect(matches.length > 0).toBe(true);
        for (const m of matches) {
          expect(m.charCount > 0).toBe(true);
          expect(m.rects.length > 0).toBe(true);
        }
      } finally {
        await doc.close();
      }
    });

    test('regex flags are restrictions: matchCase and wholeWord return subsets', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const all = await collectAll(doc, {
          query: { text: fixture.presentRegex, regex: true },
        });
        const key = (m: SearchMatch) => `${m.pageObjectNumber}:${m.charStart}:${m.charCount}`;
        const allKeys = new Set(all.matches.map(key));
        // Each flag can only REMOVE matches, never invent them — true for
        // any fixture pattern, so the suite needs no per-fixture counts.
        for (const flags of [{ matchCase: true }, { wholeWord: true }]) {
          const restricted = await collectAll(doc, {
            query: { text: fixture.presentRegex, regex: true, ...flags },
          });
          expect(restricted.matches.length <= all.matches.length).toBe(true);
          for (const m of restricted.matches) expect(allKeys.has(key(m))).toBe(true);
        }
      } finally {
        await doc.close();
      }
    });

    test('regex + matchDiacritics is rejected with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        let caught: unknown;
        try {
          await doc.search.query({
            query: { text: fixture.presentRegex, regex: true, matchDiacritics: true },
          });
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('dialect violations are rejected with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        for (const pattern of ['(a)\\1', '(?=x)y', '(']) {
          let caught: unknown;
          try {
            await doc.search.query({ query: { text: pattern, regex: true } });
          } catch (err) {
            caught = err;
          }
          expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
        }
      } finally {
        await doc.close();
      }
    });

    test('an empty needle returns an exhausted, empty slice', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const slice = await doc.search.query({ query: { text: '   ' } });
        expect(slice.matches.length).toBe(0);
        expect(slice.nextCursor).toBe(null);
      } finally {
        await doc.close();
      }
    });

    test('abort() on query rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const p = doc.search.query({ query: { text: fixture.presentLiteral } });
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });

    test('query after close throws DocNotOpen', async () => {
      const doc = await openFixture(engine, opts);
      await doc.close();
      let caught: unknown;
      try {
        await doc.search.query({ query: { text: fixture.presentLiteral } });
      } catch (err) {
        caught = err;
      }
      expect(EngineError.is(caught, EngineErrorCode.DocNotOpen)).toBe(true);
    });
  });
}

async function openFixture(engine: Engine, opts: SearchConformanceOptions) {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
