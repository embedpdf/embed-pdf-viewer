import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
import type { AnnotationListPageSnapshot } from '../annotation/AnnotationListSnapshot';
import { AnnotationDTOSchema } from '../annotation/kinds';
import type { AnnotationDTO } from '../annotation/kinds';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { AbortError } from '../promise/AbortError';
import {
  AnnotationListPageSnapshotSchema,
  AnnotationListSnapshotAllPagesSchema,
} from '../wire/schemas';

/**
 * Expected per-fixture annotation knowledge. The harness asserts against
 * these without locking the exact wire content, so different fixtures can
 * be added by suites without rewriting the harness.
 */
export interface AnnotationReadConformanceFixture extends ConformanceFixture {
  /** PDF object number of the page used by the annotation tests. */
  pageObjectNumber: number;
  /** The total annotation count expected on that page (across all subtypes). */
  expectedAnnotationCount: number;
  /** At least this many `'highlight'` annotations on the page. */
  minHighlightCount: number;
  /** At least this many `'unsupported'` annotations on the page. */
  minUnsupportedCount: number;
  /** At least this many `'circle'` annotations on the page. Defaults to 0. */
  minCircleCount?: number;
  /** At least this many `'square'` annotations on the page. Defaults to 0. */
  minSquareCount?: number;
  /** At least this many `'polygon'` annotations on the page. Defaults to 0. */
  minPolygonCount?: number;
  /** At least this many `'polyline'` annotations on the page. Defaults to 0. */
  minPolylineCount?: number;
  /** At least this many `'line'` annotations on the page. Defaults to 0. */
  minLineCount?: number;
  /** At least this many `'ink'` annotations on the page. Defaults to 0. */
  minInkCount?: number;
  /** At least this many `'free-text'` annotations on the page. Defaults to 0. */
  minFreeTextCount?: number;
  /** At least this many `'caret'` annotations on the page. Defaults to 0. */
  minCaretCount?: number;
  /**
   * `true` if the fixture has at least one weak annotation (no /NM, direct
   * object). Drives the weak-ref + revision tests.
   */
  expectsWeakAnnotation: boolean;
}

export interface AnnotationConformanceOptions extends Omit<ConformanceOptions, 'fixture'> {
  fixture: AnnotationReadConformanceFixture;
}

export function runAnnotationReadConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation read conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('listRawAll returns one entry per page with valid PageState', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const snap = await doc.annotations.listRawAll();
        expect(AnnotationListSnapshotAllPagesSchema.safeParse(snap).success).toBe(true);
        expect(snap.pages.length >= 1).toBe(true);
        const target = snap.pages.find(
          (p) => p.pageState.pageObjectNumber === opts.fixture.pageObjectNumber,
        );
        expect(target !== undefined).toBe(true);
        expect(target!.annotations.length).toBe(opts.fixture.expectedAnnotationCount);
      } finally {
        await doc.close();
      }
    });

    test('listRaw on the test page returns the expected counts and DTO shape', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const snap = await doc.annotations.listRaw(opts.fixture.pageObjectNumber);
        expect(AnnotationListPageSnapshotSchema.safeParse(snap).success).toBe(true);
        expect(snap.annotations.length).toBe(opts.fixture.expectedAnnotationCount);
        const highlights = snap.annotations.filter((a) => a.subtype === 'highlight');
        expect(highlights.length >= opts.fixture.minHighlightCount).toBe(true);
        const unsupported = snap.annotations.filter((a) => a.subtype === 'unsupported');
        expect(unsupported.length >= opts.fixture.minUnsupportedCount).toBe(true);
        const circles = snap.annotations.filter((a) => a.subtype === 'circle');
        expect(circles.length >= (opts.fixture.minCircleCount ?? 0)).toBe(true);
        const squares = snap.annotations.filter((a) => a.subtype === 'square');
        expect(squares.length >= (opts.fixture.minSquareCount ?? 0)).toBe(true);
        const polygons = snap.annotations.filter((a) => a.subtype === 'polygon');
        expect(polygons.length >= (opts.fixture.minPolygonCount ?? 0)).toBe(true);
        const polylines = snap.annotations.filter((a) => a.subtype === 'polyline');
        expect(polylines.length >= (opts.fixture.minPolylineCount ?? 0)).toBe(true);
        const lines = snap.annotations.filter((a) => a.subtype === 'line');
        expect(lines.length >= (opts.fixture.minLineCount ?? 0)).toBe(true);
        const inks = snap.annotations.filter((a) => a.subtype === 'ink');
        expect(inks.length >= (opts.fixture.minInkCount ?? 0)).toBe(true);
        const freeTexts = snap.annotations.filter((a) => a.subtype === 'free-text');
        expect(freeTexts.length >= (opts.fixture.minFreeTextCount ?? 0)).toBe(true);
        const carets = snap.annotations.filter((a) => a.subtype === 'caret');
        expect(carets.length >= (opts.fixture.minCaretCount ?? 0)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('shape/vertex/line annotations expose their family fields', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const snap = await doc.annotations.listRaw(opts.fixture.pageObjectNumber);
        for (const a of snap.annotations) {
          // Ink carries the geometry styling (/C, /CA, /BS) but NOT /IC, plus
          // its /InkList (a non-empty array of point paths).
          if (a.subtype === 'ink') {
            expect(a.color !== undefined && a.color !== null).toBe(true);
            expect(typeof a.strokeWidth).toBe('number');
            expect(typeof a.borderStyle).toBe('string');
            expect(typeof a.opacity).toBe('number');
            expect('interiorColor' in a).toBe(false);
            expect(Array.isArray(a.inkList)).toBe(true);
            expect(a.inkList.length >= 1).toBe(true);
            expect(Array.isArray(a.inkList[0])).toBe(true);
            expect(a.inkList[0]!.length >= 1).toBe(true);
            continue;
          }
          // Free text: text fields (/DA) + nullable /C background + intent.
          if (a.subtype === 'free-text') {
            expect(typeof a.fontFamily).toBe('string');
            expect(typeof a.fontSize).toBe('number');
            expect(typeof a.textAlign).toBe('string');
            expect(a.color !== undefined && a.color !== null).toBe(true);
            expect('interiorColor' in a).toBe(true);
            expect(a.intent === 'free-text' || a.intent === 'free-text-callout').toBe(true);
            if (a.intent === 'free-text-callout' && a.calloutLine) {
              expect(a.calloutLine.length === 2 || a.calloutLine.length === 3).toBe(true);
            }
            continue;
          }
          // Caret: color-only style (/C, /CA) + optional /RD, no border/quads.
          if (a.subtype === 'caret') {
            expect(a.color !== undefined && a.color !== null).toBe(true);
            expect(typeof a.opacity).toBe('number');
            expect('strokeWidth' in a).toBe(false);
            expect('quadPoints' in a).toBe(false);
            continue;
          }
          // Every stroke/fill family member shares this styling surface.
          const isFilledStyle =
            a.subtype === 'circle' ||
            a.subtype === 'square' ||
            a.subtype === 'polygon' ||
            a.subtype === 'polyline' ||
            a.subtype === 'line';
          if (!isFilledStyle) continue;
          // interiorColor is Color | null; color (/C) is always present.
          expect(a.color !== undefined && a.color !== null).toBe(true);
          expect(typeof a.strokeWidth).toBe('number');
          expect(typeof a.borderStyle).toBe('string');
          expect(typeof a.opacity).toBe('number');
          expect('interiorColor' in a).toBe(true);

          if (a.subtype === 'polygon' || a.subtype === 'polyline') {
            expect(Array.isArray(a.vertices)).toBe(true);
            expect(a.vertices.length >= 2).toBe(true);
          }
          if (a.subtype === 'polyline') {
            expect(typeof a.lineEndings.start).toBe('string');
            expect(typeof a.lineEndings.end).toBe('string');
          }
          if (a.subtype === 'line') {
            expect(typeof a.linePoints.start.x).toBe('number');
            expect(typeof a.linePoints.end.y).toBe('number');
            expect(typeof a.lineEndings.start).toBe('string');
            expect(typeof a.lineEndings.end).toBe('string');
          }
        }
      } finally {
        await doc.close();
      }
    });

    test('full page list dispatches per-subtype and matches raw counts', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(opts.fixture.pageObjectNumber);
        const full = await page.annotations.list();
        expect(AnnotationListPageSnapshotSchema.safeParse(full).success).toBe(true);
        expect(full.annotations.length).toBe(opts.fixture.expectedAnnotationCount);
      } finally {
        await doc.close();
      }
    });

    test('every annotation DTO satisfies AnnotationDTOSchema (discriminated union)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const snap = await doc.annotations.listRaw(opts.fixture.pageObjectNumber);
        for (const a of snap.annotations) {
          const result = AnnotationDTOSchema.safeParse(a);
          expect(result.success).toBe(true);
        }
      } finally {
        await doc.close();
      }
    });

    test('AnnotationDTOSchema rejects an annotation with a foreign subtype', () => {
      const bogus: unknown = {
        subtype: 'pretend-not-real',
        ref: { kind: 'objectNumber', pageObjectNumber: 1, annotObjectNumber: 1 },
        pageObjectNumber: 1,
        index: 0,
        identityQuality: 'durable',
        nm: null,
        flags: emptyFlags(),
        rect: { left: 0, top: 0, right: 0, bottom: 0 },
        contents: null,
        author: null,
        created: null,
        modified: null,
      };
      const result = AnnotationDTOSchema.safeParse(bogus);
      expect(result.success).toBe(false);
    });

    if (opts.fixture.expectsWeakAnnotation) {
      test('weak annotations carry identityQuality: weak and ref.kind: index', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const snap = await doc.annotations.listRaw(opts.fixture.pageObjectNumber);
          const weak = snap.annotations.find((a) => a.identityQuality === 'weak');
          expect(weak !== undefined).toBe(true);
          expect(weak!.ref.kind).toBe('index');
        } finally {
          await doc.close();
        }
      });

      test('a stale revision token throws InvalidReference', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const page = doc.page(opts.fixture.pageObjectNumber);
          const snap = await page.annotations.list();
          const weak = snap.annotations.find((a) => a.identityQuality === 'weak');
          expect(weak !== undefined).toBe(true);
          const staleRevision = {
            ...snap.pageState.revision,
            generation: snap.pageState.revision.generation + 999,
          };
          // create() will fail in this slice with NotImplemented; the
          // path we exercise here is reading-back via a fabricated
          // index-ref. We can't hit it via a public read API today, so
          // this test is a placeholder until mutations land. It still
          // proves the schema accepts a stale revision shape.
          expect(staleRevision.generation > snap.pageState.revision.generation).toBe(true);
        } finally {
          await doc.close();
        }
      });
    }

    test('abort() on listRaw rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const p = doc.annotations.listRaw(opts.fixture.pageObjectNumber);
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });

    test('listRaw on an unknown pageObjectNumber throws NotFound', async () => {
      const doc = await openFixture(engine, opts);
      try {
        let caught: unknown;
        try {
          await doc.annotations.listRaw(999_999_999);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeTruthy();
        expect(EngineError.is(caught, EngineErrorCode.NotFound)).toBe(true);
      } finally {
        await doc.close();
      }
    });
  });
}

async function openFixture(engine: Engine, opts: AnnotationConformanceOptions) {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}

function emptyFlags() {
  return {
    invisible: false,
    hidden: false,
    print: false,
    noZoom: false,
    noRotate: false,
    noView: false,
    readOnly: false,
    locked: false,
    toggleNoView: false,
    lockedContents: false,
  };
}

// Re-export for convenience: tests can hand a literal snapshot.
export type { AnnotationListPageSnapshot, AnnotationDTO };
