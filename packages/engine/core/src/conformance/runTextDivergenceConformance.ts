import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
import type { CharMapAnchor } from '../text/charmap';
import { sliceTextByChars } from '../text/charmap';
import type { Engine } from '../engine/Engine';
import { PageTextSnapshotSchema } from '../wire/schemas';

/**
 * Index-space divergence conformance: the cases where a page's CHARACTER
 * space (what geometry tiles and selection/search ranges address) and its
 * extracted TEXT differ — and the `charMap` contract that bridges them.
 *
 * Fixtures pin EXACT values (text, charCount, anchors) verified against the
 * wasm runtime, so both engines must produce byte-identical snapshots:
 *
 *   - a non-printing character occupying a character slot with no text unit
 *     (`bug_1139.pdf` — every text offset shifts by one);
 *   - `/ActualText` replacement (`bug_384770169.pdf` — synthetic `kPiece`
 *     characters in lockstep with the text, identity map, real segments);
 *   - supplementary-plane text via a ToUnicode surrogate pair
 *     (`embedpdf_astral_tounicode.pdf` — two lockstep surrogate entries,
 *     identity map, astral content SURVIVES extraction).
 *
 * The search probe closes the loop: a hit's `charStart`/`charCount` must be
 * CHARACTER-space (segments join geometry), and slicing the snapshot by the
 * hit's range must reproduce the matched text exactly — the law that makes
 * select-this-match and copy compose.
 */
export interface TextDivergenceConformanceFixture extends ConformanceFixture {
  /** PDF indirect object number of the probed page. */
  pageObjectNumber: number;
  /** The EXACT extracted text (UTF-16 faithful). */
  exactText: string;
  /** The character-space size (may differ from `exactText.length`). */
  expectedCharCount: number;
  /** Expected anchors; null asserts identity (no `charMap` on the wire). */
  expectedCharMap: ReadonlyArray<CharMapAnchor> | null;
  /** Char-space slice expectations (half-open). */
  slices?: ReadonlyArray<{ from: number; to: number; text: string }>;
  /** Literal search probe with expected CHARACTER-space hit range. */
  search?: { query: string; charStart: number; charCount: number; matchedText: string };
}

export interface TextDivergenceConformanceOptions extends Omit<ConformanceOptions, 'fixture'> {
  fixture: TextDivergenceConformanceFixture;
}

export function runTextDivergenceConformance(
  runner: ConformanceTestRunner,
  opts: TextDivergenceConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;
  const fixture = opts.fixture;

  describe(`text divergence conformance: ${opts.label} [${fixture.id}]`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('snapshot is schema-valid with the exact text, charCount, and charMap', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const snap = await doc.page(fixture.pageObjectNumber).text.read();
        // Schema-parse enforces every charMap invariant (the {0,2} step
        // rule, tail === text.length, identity ⇔ absent).
        expect(PageTextSnapshotSchema.safeParse(snap).success).toBe(true);
        expect(snap.text).toBe(fixture.exactText);
        expect(snap.charCount).toBe(fixture.expectedCharCount);
        const anchors = snap.charMap ?? null;
        if (fixture.expectedCharMap === null) {
          expect(anchors === null || anchors.length === 0).toBe(true);
        } else {
          expect(anchors === null ? null : anchors.map((a) => [a[0], a[1]])).toEqual(
            fixture.expectedCharMap.map((a) => [a[0], a[1]]),
          );
        }
      } finally {
        await doc.close();
      }
    });

    test('char-space slicing round-trips through the map', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const snap = await doc.page(fixture.pageObjectNumber).text.read();
        expect(sliceTextByChars(snap, 0, snap.charCount)).toBe(snap.text);
        for (const s of fixture.slices ?? []) {
          expect(sliceTextByChars(snap, s.from, s.to)).toBe(s.text);
        }
      } finally {
        await doc.close();
      }
    });

    if (fixture.search) {
      const probe = fixture.search;
      test('search hits address character space and join the text by slicing', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const slice = await doc.search.query({ query: { text: probe.query }, mode: 'rects' });
          const hit = slice.matches.find(
            (m) => m.pageObjectNumber === fixture.pageObjectNumber,
          );
          expect(hit === undefined).toBe(false);
          expect(hit!.charStart).toBe(probe.charStart);
          expect(hit!.charCount).toBe(probe.charCount);
          // Geometry join: character-space segmentation produced real quads.
          expect(hit!.segments.length > 0).toBe(true);
          // The composition law: slicing the snapshot by the hit's range
          // reproduces the matched text (zero-width chars excluded).
          const snap = await doc.page(fixture.pageObjectNumber).text.read();
          expect(sliceTextByChars(snap, hit!.charStart, hit!.charStart + hit!.charCount)).toBe(
            probe.matchedText,
          );
        } finally {
          await doc.close();
        }
      });
    }
  });
}

async function openFixture(engine: Engine, opts: TextDivergenceConformanceOptions) {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}

/** One divergence case, minus the per-suite bytes/id wiring. */
export type TextDivergenceCase = Omit<TextDivergenceConformanceFixture, 'id' | 'bytes' | 'expected'> & {
  /** Fixture file name under the fork's `testing/resources/`. */
  resource: string;
};

/**
 * THE pinned divergence cases — one table, consumed by both engines' suites
 * so expected values cannot drift. Values verified against the wasm runtime
 * (see each case). All fixtures are single-page; the page's indirect object
 * number is 3 in each.
 */
export const TEXT_DIVERGENCE_CASES: Readonly<Record<string, TextDivergenceCase>> = {
  /** Leading NON-PRINTING character: 31 character slots, 30 text units —
   *  every text offset shifts by one, encoded by the single anchor [1, 0].
   *  The searchex embeddertest for this fixture pins the same +1 shift. */
  bug1139: {
    resource: 'bug_1139.pdf',
    pageObjectNumber: 3,
    exactText: 'Hello, world!\r\nGoodbye, world!',
    expectedCharCount: 31,
    expectedCharMap: [[1, 0]],
    slices: [
      { from: 0, to: 1, text: '' }, // the non-printing char alone projects to nothing
      { from: 1, to: 7, text: 'Hello,' },
      { from: 16, to: 23, text: 'Goodbye' },
    ],
    search: { query: 'Goodbye', charStart: 16, charCount: 7, matchedText: 'Goodbye' },
  },
  /** `/ActualText` replacement: the span's real glyphs are REPLACED by one
   *  synthetic kPiece character per ActualText character, lockstep with the
   *  text (identity map), with synthesized evenly-divided boxes — so search
   *  segments exist and extraction yields the ActualText, not the glyphs. */
  actualText: {
    resource: 'bug_384770169.pdf',
    pageObjectNumber: 3,
    exactText: 'What is my favorite food?',
    expectedCharCount: 25,
    expectedCharMap: null,
    slices: [{ from: 11, to: 19, text: 'favorite' }],
    search: { query: 'favorite', charStart: 11, charCount: 8, matchedText: 'favorite' },
  },
  /** Supplementary-plane text via a ToUnicode surrogate pair: PDFium stores
   *  one character-list entry PER SURROGATE HALF in lockstep with the text
   *  (identity map, no divergence in this representation) — and the emoji
   *  SURVIVES extraction end to end. The combined-astral representation
   *  (font-cmap path, one entry per code point → a [+2] anchor) is covered
   *  by the charmap unit tests and the reader's divergent walk. */
  astralToUnicode: {
    resource: 'embedpdf_astral_tounicode.pdf',
    pageObjectNumber: 3,
    exactText: '😀B!',
    expectedCharCount: 4,
    expectedCharMap: null,
    slices: [
      { from: 0, to: 2, text: '😀' },
      { from: 2, to: 3, text: 'B' },
    ],
    search: { query: 'B!', charStart: 2, charCount: 2, matchedText: 'B!' },
  },
};
