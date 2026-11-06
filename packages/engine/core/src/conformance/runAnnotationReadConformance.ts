import { EVERY_PERMISSION } from './fixtureScope';
import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
import type { AnnotationList } from '../annotation/AnnotationList';
import { AnnotationSchema } from '../annotation/kinds';
import type { Annotation } from '../annotation/kinds';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { annotationKey } from '../identity/annotationKey';
import { toPageRef } from '../identity/PageRef';
import { AbortError } from '../promise/AbortError';
import { AnnotationListSchema } from '../wire/schemas';

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
   * `true` if the fixture page has at least one annotation born inline (a
   * dictionary in `/Annots`, no object number). Drives the `baseIndex` tests.
   */
  expectsInlineAnnotation: boolean;
}

export interface AnnotationConformanceOptions extends Omit<ConformanceOptions, 'fixture'> {
  fixture: AnnotationReadConformanceFixture;
}

export function runAnnotationReadConformance(
  runner: ConformanceTestRunner,
  options: AnnotationConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation read conformance: ${options.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await options.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('list() returns every page, and each annotation names its page', async () => {
      const doc = await openFixture(engine, options);
      try {
        const list = await doc.annotations.list();
        expect(AnnotationListSchema.safeParse(list).success).toBe(true);
        expect(list.pages.length >= 1).toBe(true);
        // Cloud stamps its reconciliation cursor; local omits it. When
        // present it must be a nonnegative integer.
        if (list.auditHead !== undefined) {
          expect(Number.isInteger(list.auditHead) && list.auditHead >= 0).toBe(true);
        }
        const target = list.pages.find((p) => p.objectNumber === options.fixture.pageObjectNumber);
        expect(target !== undefined).toBe(true);
        const onTarget = list.annotations.filter(
          (a) => a.page.objectNumber === options.fixture.pageObjectNumber,
        );
        expect(onTarget.length).toBe(options.fixture.expectedAnnotationCount);
      } finally {
        await doc.close();
      }
    });

    test('list({ pages }) on the test page returns the expected counts and DTO shape', async () => {
      const doc = await openFixture(engine, options);
      try {
        const snap = await doc.annotations.list({
          pages: [toPageRef(options.fixture.pageObjectNumber)],
        });
        expect(AnnotationListSchema.safeParse(snap).success).toBe(true);
        expect(snap.pages.map((p) => p.objectNumber)).toEqual([options.fixture.pageObjectNumber]);
        expect(snap.annotations.length).toBe(options.fixture.expectedAnnotationCount);
        const highlights = snap.annotations.filter((a) => a.subtype === 'highlight');
        expect(highlights.length >= options.fixture.minHighlightCount).toBe(true);
        const unsupported = snap.annotations.filter((a) => a.subtype === 'unsupported');
        expect(unsupported.length >= options.fixture.minUnsupportedCount).toBe(true);
        const circles = snap.annotations.filter((a) => a.subtype === 'circle');
        expect(circles.length >= (options.fixture.minCircleCount ?? 0)).toBe(true);
        const squares = snap.annotations.filter((a) => a.subtype === 'square');
        expect(squares.length >= (options.fixture.minSquareCount ?? 0)).toBe(true);
        const polygons = snap.annotations.filter((a) => a.subtype === 'polygon');
        expect(polygons.length >= (options.fixture.minPolygonCount ?? 0)).toBe(true);
        const polylines = snap.annotations.filter((a) => a.subtype === 'polyline');
        expect(polylines.length >= (options.fixture.minPolylineCount ?? 0)).toBe(true);
        const lines = snap.annotations.filter((a) => a.subtype === 'line');
        expect(lines.length >= (options.fixture.minLineCount ?? 0)).toBe(true);
        const inks = snap.annotations.filter((a) => a.subtype === 'ink');
        expect(inks.length >= (options.fixture.minInkCount ?? 0)).toBe(true);
        const freeTexts = snap.annotations.filter((a) => a.subtype === 'free-text');
        expect(freeTexts.length >= (options.fixture.minFreeTextCount ?? 0)).toBe(true);
        const carets = snap.annotations.filter((a) => a.subtype === 'caret');
        expect(carets.length >= (options.fixture.minCaretCount ?? 0)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('shape/vertex/line annotations expose their family fields', async () => {
      const doc = await openFixture(engine, options);
      try {
        const snap = await doc.annotations.list({
          pages: [toPageRef(options.fixture.pageObjectNumber)],
        });
        for (const a of snap.annotations) {
          // Ink carries the geometry styling (/C, /CA, /BS) but not /IC, plus
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

    test('page.annotations.list() is the document list of that page', async () => {
      const doc = await openFixture(engine, options);
      try {
        const ref = toPageRef(options.fixture.pageObjectNumber);
        const onPage = await doc.page(ref).annotations.list();
        expect(AnnotationListSchema.safeParse(onPage).success).toBe(true);
        expect(onPage.annotations.length).toBe(options.fixture.expectedAnnotationCount);
        expect(onPage).toEqual(await doc.annotations.list({ pages: [ref] }));
      } finally {
        await doc.close();
      }
    });

    test('every annotation DTO satisfies AnnotationSchema (discriminated union)', async () => {
      const doc = await openFixture(engine, options);
      try {
        const snap = await doc.annotations.list({
          pages: [toPageRef(options.fixture.pageObjectNumber)],
        });
        for (const a of snap.annotations) {
          const result = AnnotationSchema.safeParse(a);
          expect(result.success).toBe(true);
        }
      } finally {
        await doc.close();
      }
    });

    test('AnnotationSchema reads a subtype it does not know as unsupported, and a malformed one it knows fails', async () => {
      const doc = await openFixture(engine, options);
      try {
        const snap = await doc.annotations.list({
          pages: [toPageRef(options.fixture.pageObjectNumber)],
        });
        for (const annotation of snap.annotations) {
          const newer = { ...annotation, subtype: 'from-a-newer-server' };
          expect(AnnotationSchema.parse(newer)).toMatchObject({
            subtype: 'unsupported',
            ref: annotation.ref,
            rect: annotation.rect,
          });
          expect(AnnotationSchema.safeParse({ ...annotation, rect: 'wide' }).success).toBe(false);
        }
      } finally {
        await doc.close();
      }
    });

    if (options.fixture.expectsInlineAnnotation) {
      test('an annotation born inline is named by its baseIndex: its position in the file', async () => {
        const doc = await openFixture(engine, options);
        try {
          const page = doc.page(toPageRef(options.fixture.pageObjectNumber));
          const { annotations } = await page.annotations.list();
          const inline = annotations.find((a) => a.ref.kind === 'baseIndex');
          expect(inline !== undefined).toBe(true);
          // The name resolves: a read by it finds the same annotation.
          const again = await page.annotations.list();
          expect(
            again.annotations.find((a) => annotationKey(a.ref) === annotationKey(inline!.ref)),
          ).toEqual(inline);
        } finally {
          await doc.close();
        }
      });

      test('a baseIndex that names no inline annotation is NotFound', async () => {
        const doc = await openFixture(engine, options);
        try {
          const page = doc.page(toPageRef(options.fixture.pageObjectNumber));
          const { annotations } = await page.annotations.list();
          const missing = await page.annotations
            .update(
              {
                kind: 'baseIndex',
                page: toPageRef(options.fixture.pageObjectNumber),
                baseIndex: annotations.length + 10,
              },
              { contents: 'nobody' },
            )
            .then(
              () => null,
              (error: unknown) => error,
            );
          expect(EngineError.is(missing, EngineErrorCode.NotFound)).toBe(true);
        } finally {
          await doc.close();
        }
      });
    }

    test('abort() on listRaw rejects with AbortError', async () => {
      const doc = await openFixture(engine, options);
      try {
        const p = doc.annotations.list({ pages: [toPageRef(options.fixture.pageObjectNumber)] });
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });

    test('listRaw on an unknown pageObjectNumber throws NotFound', async () => {
      const doc = await openFixture(engine, options);
      try {
        let caught: unknown;
        try {
          await doc.annotations.list({ pages: [toPageRef(999_999_999)] });
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
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes }, EVERY_PERMISSION);
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}

// Re-export for convenience: tests can hand a literal snapshot.
export type { AnnotationList, Annotation };
