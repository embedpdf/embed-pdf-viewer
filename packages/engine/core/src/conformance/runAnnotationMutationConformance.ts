import { appearanceRaster } from './appearanceRasters';
import { iconRect } from './creatables';
import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
import { drawnPointsOf } from '../pageSpace/helpers';
import type {
  AnnotationDraft,
  AnnotationPatch,
  CaretDraft,
  CircleDraft,
  FreeTextDraft,
  HighlightDraft,
  InkDraft,
  LineDraft,
  LinkDraft,
  PolygonDraft,
  PolylineDraft,
  RedactDraft,
  SquareDraft,
  StrikeoutDraft,
  TextDraft,
  TextPatch,
} from '../annotation/kinds';
import type { WeakAnnotationEditSession } from '../engine/DocumentAnnotationsService';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PageBox, PagePoint } from '../geometry/pageSpace';
import { pagePointsBounds, pagePointTurned, pageTurnOfUpright } from '../pageSpace/helpers';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { AnnotationStableId } from '../identity/AnnotationStableId';
import { toPageRef } from '../identity/PageRef';
import { AbortError } from '../promise/AbortError';
import {
  AnnotationCreateResultSchema,
  AnnotationMoveResultSchema,
  AnnotationUpdateResultSchema,
} from '../wire/schemas';

/**
 * Per-fixture knowledge the mutation harness needs. The shared fixture
 * fields (id, bytes, etc.) come from `ConformanceFixture`; the bits below
 * pin the test page. The harness asserts behaviour, not exact wire
 * content, so the same fixture can run against both local (WASM) and
 * cloud (native via @cloudpdf/server) engines.
 */
export interface AnnotationMutationConformanceFixture extends ConformanceFixture {
  /** PDF object number of the page used by the mutation tests. */
  pageObjectNumber: number;
  /** Page already has at least one weak annotation (no /NM, direct object). */
  expectsWeakAnnotation: boolean;
  /**
   * QuadPoints to use for the create() smoke test, in page space; pick a
   * small rectangle that fits anywhere on the fixture page so we don't
   * flake on different page sizes.
   */
  createQuad?: HighlightDraft['quadPoints'];
  /**
   * The box to use for the shape (circle/square) create tests, in page
   * space; pick a small box that fits anywhere on the fixture page.
   */
  createShapeRect?: PageBox;
  /**
   * `/Vertices` to use for the polygon/polyline create tests, in page
   * space; must fit inside `createShapeRect`. Defaults to a small triangle.
   */
  createVertices?: PagePoint[];
  /**
   * `/L` endpoints to use for the line create test, in page space; must fit
   * inside `createShapeRect`. Defaults to the rect's diagonal.
   */
  createLinePoints?: LineDraft['linePoints'];
  /**
   * `/InkList` strokes to use for the ink create test, in page space; must
   * fit inside `createShapeRect`. Defaults to a single short stroke.
   */
  createInkList?: InkDraft['inkList'];
}

export interface AnnotationMutationConformanceOptions extends Omit<ConformanceOptions, 'fixture'> {
  fixture: AnnotationMutationConformanceFixture;
}

/** Its top corners first, as a text selection's quads are. */
const DEFAULT_QUAD: HighlightDraft['quadPoints'] = [
  {
    p1: { x: 50, y: 100 },
    p2: { x: 150, y: 100 },
    p3: { x: 50, y: 120 },
    p4: { x: 150, y: 120 },
  },
];

const DEFAULT_SHAPE_RECT: PageBox = { x: 60, y: 60, width: 100, height: 80 };

/** A small triangle inside DEFAULT_SHAPE_RECT (valid for polygon: >=3). */
const DEFAULT_VERTICES: PagePoint[] = [
  { x: 70, y: 130 },
  { x: 150, y: 130 },
  { x: 110, y: 70 },
];

/** A line along the diagonal of DEFAULT_SHAPE_RECT. */
const DEFAULT_LINE_POINTS: LineDraft['linePoints'] = {
  start: { x: 70, y: 130 },
  end: { x: 150, y: 70 },
};

/**
 * A knee-jointed callout leader inside DEFAULT_SHAPE_RECT: the called-out
 * point, a knee, then the point touching the text box.
 */
const DEFAULT_CALLOUT_LINE: [PagePoint, PagePoint, PagePoint] = [
  { x: 65, y: 135 },
  { x: 90, y: 110 },
  { x: 110, y: 100 },
];

/** A single freehand stroke inside DEFAULT_SHAPE_RECT (valid for ink). */
/** Equal to 3 decimals: points and rects are stored as f32. */
const near = (a: number, b: number): boolean => Math.abs(a - b) < 5e-4;

const DEFAULT_INK_STROKES: InkDraft['inkList'] = [
  [
    { x: 70, y: 130 },
    { x: 100, y: 80 },
    { x: 130, y: 120 },
    { x: 150, y: 70 },
  ],
];

/**
 * Mutation conformance suite. Mirrors the read suite: tests are written
 * once and run against any engine that satisfies the public API
 * surface. Both local (worker host + WASM) and cloud (HTTP +
 * @cloudpdf/server) implementations must pass identically.
 *
 * The locked rules being verified here:
 *   - `create` is append-only: PDFium drops the new annotation at
 *     `index = previousCount`, so no existing index shifts. Treated
 *     as non-invalidating — revisions do not bump and weak refs
 *     captured before the create remain valid.
 *   - `update` is non-structural; revisions do not bump.
 *   - Opportunistic /NM stamp upgrades a weak annotation's ref to
 *     `kind: 'nm'` on update; an already-durable annotation's /NM is
 *     never touched.
 *   - `delete` and `move` are the only index-shifting ops. They bump
 *     the per-page revision and, on a page that had weak refs before
 *     the mutation, surface `shouldRefetch: 'weakRefsInvalidated'`.
 *   - Abort propagates as `AbortError` even before the worker
 *     responds.
 */
export function runAnnotationMutationConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationMutationConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;
  const fix = opts.fixture;
  const quad = fix.createQuad ?? DEFAULT_QUAD;
  const shapeRect = fix.createShapeRect ?? DEFAULT_SHAPE_RECT;
  const vertices = fix.createVertices ?? DEFAULT_VERTICES;
  const linePoints = fix.createLinePoints ?? DEFAULT_LINE_POINTS;
  const inkStrokes = fix.createInkList ?? DEFAULT_INK_STROKES;

  describe(`annotation mutation conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('create appends without shifting indices and leaves weak refs valid', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const before = await page.annotations.list();
        const beforeCount = before.annotations.length;

        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'mutation conformance: created',
          color: '#c86432',
          opacity: 0.5,
          quadPoints: quad,
        };
        const result = await page.annotations.create(draft);
        expect(AnnotationCreateResultSchema.safeParse(result).success).toBe(true);
        expect(result.meta.affectedPages.length).toBe(1);
        expect(result.meta.affectedPages[0].page.objectNumber).toBe(fix.pageObjectNumber);
        expect('cacheDelta' in result.meta).toBe(true);

        // Always durable (engine uses the EPDFPage_CreateAnnot fork helper).
        expect(result.annotation.identityQuality).toBe('durable');
        expect(result.annotation.subtype).toBe('highlight');
        expect(result.annotation.ref.kind).toBe('objectNumber');

        // Locked rule: create is append-only, so the page revision does
        // not bump and no weak refs become stale — regardless of whether
        // the page had pre-existing weak annotations.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pages[0].revision.generation,
        );
        expect(result.meta.shouldRefetch).toBe(null);
        expect(result.meta.weakRefsInvalidated).toBe(false);
        expect(result.meta.changed.length).toBe(1);

        // The annotation is actually on the page now, at the end of the
        // /Annots array. This is the invariant that justifies the
        // non-invalidating impact: every prior index is preserved.
        const after = await page.annotations.list();
        expect(after.annotations.length).toBe(beforeCount + 1);
        expect(result.annotation.index).toBe(beforeCount);
      } finally {
        await doc.close();
      }
    });

    test('create and update write each annotation flag as its own field', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));

        // Create with a single flag set; the others must default to false.
        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'mutation conformance: flags',
          color: '#0a141e',
          opacity: 1,
          quadPoints: quad,
          print: true,
        };
        const created = await page.annotations.create(draft);
        expect(created.annotation.print).toBe(true);
        expect(created.annotation.hidden).toBe(false);

        // Setting another flag leaves `print` as it is.
        const hidden = await page.annotations.update(created.annotation.ref, { hidden: true });
        expect(hidden.annotation.hidden).toBe(true);
        expect(hidden.annotation.print).toBe(true);

        // Clearing one flag leaves the rest untouched.
        const cleared = await page.annotations.update(created.annotation.ref, { print: false });
        expect(cleared.annotation.print).toBe(false);
        expect(cleared.annotation.hidden).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('create shape annotations (circle + square) round-trip shape fields', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));

        const circleDraft: CircleDraft = {
          subtype: 'circle',
          contents: 'mutation conformance: circle',
          box: shapeRect,
          interiorColor: '#ff0000',
          color: '#0000ff',
          strokeWidth: 3,
          borderStyle: 'solid',
          opacity: 0.6,
        };
        const circle = await page.annotations.create(circleDraft);
        expect(AnnotationCreateResultSchema.safeParse(circle).success).toBe(true);
        expect(circle.annotation.subtype).toBe('circle');
        expect(circle.annotation.identityQuality).toBe('durable');
        expect(circle.annotation.ref.kind).toBe('objectNumber');
        if (circle.annotation.subtype === 'circle') {
          expect(circle.annotation.interiorColor).toBe('#ff0000');
          expect(circle.annotation.color).toBe('#0000ff');
          expect(circle.annotation.strokeWidth).toBe(3);
          expect(circle.annotation.borderStyle).toBe('solid');
          // /CA stored as f32 — compare at 2dp to absorb float drift.
          expect(Math.round(circle.annotation.opacity * 100) / 100).toBe(0.6);
          // The border is drawn inside the box, so `rect` is the box. The
          // chosen bounds are small integers that are exactly representable
          // in f32, so an exact compare is safe.
          expect(circle.annotation.box).toEqual(shapeRect);
          expect(circle.annotation.rect).toEqual(shapeRect);
        }

        const squareDraft: SquareDraft = {
          subtype: 'square',
          contents: 'mutation conformance: square',
          box: shapeRect,
          interiorColor: null,
          color: '#008000',
          strokeWidth: 2,
          borderStyle: 'dashed',
          dashArray: [3, 2],
          opacity: 1,
        };
        const square = await page.annotations.create(squareDraft);
        expect(AnnotationCreateResultSchema.safeParse(square).success).toBe(true);
        expect(square.annotation.subtype).toBe('square');
        if (square.annotation.subtype === 'square') {
          // interiorColor omitted/null => no fill.
          expect(square.annotation.interiorColor).toBe(null);
          expect(square.annotation.color).toBe('#008000');
          expect(square.annotation.borderStyle).toBe('dashed');
          expect(square.annotation.dashArray).toEqual([3, 2]);
        }

        const after = await page.annotations.list();
        const subtypes = after.annotations.map((a) => a.subtype);
        expect(subtypes.includes('circle')).toBe(true);
        expect(subtypes.includes('square')).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('a cloudy border reaches past the box, and rect takes it in', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));

        // A plain shape reads `cloudyIntensity` as explicit null — absence is
        // stated, so a read DTO compares structurally against a clearing
        // patch. The draft also states it as null (exactly what the plugin's
        // total projection emits for a fresh solid shape): a draft writer must
        // skip null, never dereference it — the stale-worker regression where
        // solid creates vanished while cloudy ones survived.
        const plainDraft: SquareDraft = {
          subtype: 'square',
          contents: 'mutation conformance: cloudy border',
          box: shapeRect,
          color: '#008000',
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
          cloudyIntensity: null,
        };
        const plain = await page.annotations.create(plainDraft);
        expect(plain.annotation.subtype).toBe('square');
        if (plain.annotation.subtype === 'square') {
          expect(plain.annotation.cloudyIntensity).toBe(null);
          expect(plain.annotation.rect).toEqual(shapeRect);
        }

        // The bumps reach out past the box on every side: the box stays, and
        // `rect` takes them in.
        const cloudy = await page.annotations.update(plain.annotation.ref, {
          subtype: 'square',
          cloudyIntensity: 2,
        });
        expect(cloudy.annotation.subtype).toBe('square');
        if (cloudy.annotation.subtype === 'square') {
          expect(cloudy.annotation.cloudyIntensity).toBe(2);
          const { box, rect } = cloudy.annotation;
          for (const edge of ['x', 'y', 'width', 'height'] as const) {
            expect(Math.abs(box[edge] - shapeRect[edge]) < 1e-3).toBe(true);
          }
          expect(rect.x < box.x - 1 && rect.y < box.y - 1).toBe(true);
          expect(rect.x + rect.width > box.x + box.width + 1).toBe(true);
          expect(rect.y + rect.height > box.y + box.height + 1).toBe(true);
        }

        // A solid border gives the room back: no stale bump room is left
        // behind (the Adobe "phantom padding" regression).
        const solid = await page.annotations.update(plain.annotation.ref, {
          subtype: 'square',
          cloudyIntensity: null,
        });
        expect(solid.annotation.subtype).toBe('square');
        if (solid.annotation.subtype === 'square') {
          expect(solid.annotation.cloudyIntensity).toBe(null);
          expect(solid.annotation.rect).toEqual(shapeRect);
        }

        // Polygon carries /BE too (but never /RD, per ISO 32000) — same tri-state,
        // including the draft path.
        const polyDraft: PolygonDraft = {
          subtype: 'polygon',
          contents: 'mutation conformance: polygon cloudy tri-state',
          vertices,
          color: '#0000ff',
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
          cloudyIntensity: 1,
        };
        const poly = await page.annotations.create(polyDraft);
        expect(poly.annotation.subtype).toBe('polygon');
        if (poly.annotation.subtype === 'polygon') {
          expect(poly.annotation.cloudyIntensity).toBe(1);
        }
        const polySolid = await page.annotations.update(poly.annotation.ref, {
          subtype: 'polygon',
          cloudyIntensity: null,
        });
        expect(polySolid.annotation.subtype).toBe('polygon');
        if (polySolid.annotation.subtype === 'polygon') {
          expect(polySolid.annotation.cloudyIntensity).toBe(null);
        }
      } finally {
        await doc.close();
      }
    });

    test('update echoes the appearance verdict: moves preserve /AP, restyles re-bake', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const draft: SquareDraft = {
          subtype: 'square',
          contents: 'mutation conformance: appearance echo',
          box: shapeRect,
          color: '#c80000',
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
        };
        const created = await page.annotations.create(draft);

        // A full-projection patch whose only real change is a same-size /Rect
        // move: the engine value-diffs away the unchanged style keys, verifies
        // the rigid translation, and preserves the baked /AP — the raster
        // invalidation signal stays off.
        const moved = await page.annotations.update(created.annotation.ref, {
          subtype: 'square',
          box: { ...shapeRect, x: shapeRect.x + 12, y: shapeRect.y + 8 },
          color: '#c80000',
          strokeWidth: 2,
          opacity: 1,
        });
        expect(moved.appearance).toEqual({ action: 'preserved', changed: false });

        // Metadata-only patches never touch /AP.
        const flagged = await page.annotations.update(created.annotation.ref, {
          subtype: 'square',
          print: true,
        });
        expect(flagged.appearance).toEqual({ action: 'preserved', changed: false });

        // A real style edit re-bakes and says so.
        const restyled = await page.annotations.update(created.annotation.ref, {
          subtype: 'square',
          interiorColor: '#ffd600',
        });
        expect(restyled.appearance).toEqual({ action: 'regenerated', changed: true });

        // A resize is not a translation — it re-bakes too.
        const resized = await page.annotations.update(created.annotation.ref, {
          subtype: 'square',
          box: { ...shapeRect, width: shapeRect.width + 40 },
        });
        expect(resized.appearance).toEqual({ action: 'regenerated', changed: true });
      } finally {
        await doc.close();
      }
    });

    test('a partial /DA patch preserves the unpatched font members', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const draft: FreeTextDraft = {
          subtype: 'free-text',
          intent: 'free-text',
          contents: 'DA read-modify-write',
          box: shapeRect,
          fontFamily: 'times-roman',
          fontSize: 14,
          textAlign: 'left',
          color: '#c80000',
        };
        const created = await page.annotations.create(draft);
        // `/DA` packs font+size+colour into one string; the writer must
        // read-modify-write, so a partial patch cannot reset the others (the
        // old constant fallbacks turned a size-only patch into 12pt black).
        expect(created.annotation.subtype).toBe('free-text');
        if (created.annotation.subtype === 'free-text') {
          expect(created.annotation.fontFamily).toBe('times-roman');
        }
        const sized = await page.annotations.update(created.annotation.ref, {
          subtype: 'free-text',
          fontSize: 18,
        });
        expect(sized.annotation.subtype).toBe('free-text');
        if (sized.annotation.subtype === 'free-text') {
          expect(sized.annotation.fontFamily).toBe('times-roman');
          expect(sized.annotation.fontSize).toBe(18);
          expect(sized.annotation.color).toBe('#c80000');
        }
        const recolored = await page.annotations.update(created.annotation.ref, {
          subtype: 'free-text',
          color: '#0000c8',
        });
        if (recolored.annotation.subtype === 'free-text') {
          expect(recolored.annotation.fontFamily).toBe('times-roman');
          expect(recolored.annotation.fontSize).toBe(18);
          expect(recolored.annotation.color).toBe('#0000c8');
        }
      } finally {
        await doc.close();
      }
    });

    test('a turn stays until changed: a box move keeps it, null straightens', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const draft: SquareDraft = {
          subtype: 'square',
          contents: 'transform tri-state',
          box: shapeRect,
          color: '#0000ff',
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
          rotation: 90,
        };
        const created = await page.annotations.create(draft);
        expect(created.annotation.subtype).toBe('square');
        if (created.annotation.subtype === 'square') {
          expect(created.annotation.rotation).toBe(90);
        }
        // The engine sets `rect` to the upright box around the turned box: a
        // quarter turn swaps its sides about the same middle.
        const turnedRect = created.annotation.rect;
        expect(turnedRect.width).toBe(shapeRect.height);
        expect(turnedRect.height).toBe(shapeRect.width);

        // The box and its turn riding one delta is a verified translation: the
        // rotation survives and the baked /AP is preserved.
        const d = { x: 15, y: -10 };
        const shift = (r: PageBox): PageBox => ({ ...r, x: r.x + d.x, y: r.y + d.y });
        const moved = await page.annotations.update(created.annotation.ref, {
          subtype: 'square',
          box: shift(shapeRect),
          rotation: 90,
        });
        expect(moved.appearance).toEqual({ action: 'preserved', changed: false });
        expect(moved.annotation.rect).toEqual(shift(turnedRect));
        if (moved.annotation.subtype === 'square') {
          expect(moved.annotation.rotation).toBe(90);
        }

        // A box-only move keeps the omitted rotation (tri-state law: a patch
        // touches what it states).
        const boxOnly = await page.annotations.update(created.annotation.ref, {
          subtype: 'square',
          box: shapeRect,
        });
        if (boxOnly.annotation.subtype === 'square') {
          expect(boxOnly.annotation.rotation).toBe(90);
        }

        // Explicit null straightens the box where it is.
        const straightened = await page.annotations.update(created.annotation.ref, {
          subtype: 'square',
          rotation: null,
        });
        if (straightened.annotation.subtype === 'square') {
          expect(straightened.annotation.rotation).toBe(null);
          expect(straightened.annotation.box).toEqual(shapeRect);
          expect(straightened.annotation.rect).toEqual(shapeRect);
        }
      } finally {
        await doc.close();
      }
    });

    test('a line, polyline, polygon or ink: rect is what the engine draws', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const contains = (outer: PageBox, inner: PageBox) =>
          outer.x <= inner.x + 1e-3 &&
          outer.y <= inner.y + 1e-3 &&
          outer.x + outer.width >= inner.x + inner.width - 1e-3 &&
          outer.y + outer.height >= inner.y + inner.height - 1e-3;
        const area = (r: PageBox) => r.width * r.height;
        const grown = (r: PageBox, by: number): PageBox => ({
          x: r.x - by,
          y: r.y - by,
          width: r.width + 2 * by,
          height: r.height + 2 * by,
        });

        // No rect is sent: the engine measures the stroke and the arrowheads.
        const line = (lineEndings: LineDraft['lineEndings']) =>
          page.annotations.create({
            subtype: 'line',
            linePoints,
            color: '#000000',
            strokeWidth: 2,
            lineEndings,
          } satisfies LineDraft);
        const plain = (await line({ start: 'none', end: 'none' })).annotation;
        const arrowed = (await line({ start: 'closed-arrow', end: 'closed-arrow' })).annotation;
        const ends = pagePointsBounds([linePoints.start, linePoints.end]);
        expect(contains(plain.rect, grown(ends, 0.5))).toBe(true);
        expect(contains(arrowed.rect, plain.rect)).toBe(true);
        expect(area(arrowed.rect) > area(plain.rect)).toBe(true);

        // A wider pen widens the rect, a narrower one narrows it again.
        const ink = (strokeWidth: number) =>
          page.annotations.create({
            subtype: 'ink',
            inkList: inkStrokes,
            color: '#1d4ed8',
            strokeWidth,
          } satisfies InkDraft);
        const thin = (await ink(1)).annotation;
        const wide = (await ink(6)).annotation;
        const drawn = pagePointsBounds(inkStrokes.flat());
        expect(contains(thin.rect, grown(drawn, 0.5))).toBe(true);
        expect(contains(wide.rect, grown(drawn, 3))).toBe(true);
        expect(wide.rect.width > thin.rect.width + 4.9).toBe(true);
        const narrowed = await page.annotations.update(wide.ref, {
          subtype: 'ink',
          strokeWidth: 1,
        });
        expect(near(narrowed.annotation.rect.x, thin.rect.x)).toBe(true);
        expect(near(narrowed.annotation.rect.width, thin.rect.width)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('points are upright: rotation turns them about the middle of their box', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const expectPoints = (actual: readonly PagePoint[], expected: readonly PagePoint[]) => {
          expect(actual.length).toBe(expected.length);
          actual.forEach((point, i) => {
            expect(near(point.x, expected[i]!.x)).toBe(true);
            expect(near(point.y, expected[i]!.y)).toBe(true);
          });
        };
        const created = await page.annotations.create({
          subtype: 'polygon',
          vertices,
          color: '#0000ff',
          strokeWidth: 2,
          rotation: 90,
        } satisfies PolygonDraft);
        const polygon = created.annotation;
        if (polygon.subtype !== 'polygon') throw new Error('expected a polygon');
        // A read gives the points as sent, and the turn.
        expect(polygon.rotation).toBe(90);
        expectPoints(polygon.vertices, vertices);
        // The page shows them turned about the middle of their box, and rect is
        // around what it shows.
        const turn = pageTurnOfUpright(vertices, 90);
        const drawn = vertices.map((point) => pagePointTurned(point, turn));
        expectPoints(drawnPointsOf(polygon)![0]!, drawn);
        const drawnBounds = pagePointsBounds(drawn);
        expect(polygon.rect.x <= drawnBounds.x).toBe(true);
        expect(polygon.rect.y <= drawnBounds.y).toBe(true);
        expect(polygon.rect.x + polygon.rect.width >= drawnBounds.x + drawnBounds.width).toBe(true);
        expect(polygon.rect.y + polygon.rect.height >= drawnBounds.y + drawnBounds.height).toBe(
          true,
        );

        // Moving the points keeps the turn and the drawing: rect moves with them.
        const d = { x: 15, y: -10 };
        const moved = await page.annotations.update(polygon.ref, {
          subtype: 'polygon',
          vertices: vertices.map((point) => ({ x: point.x + d.x, y: point.y + d.y })),
        });
        expect(moved.appearance).toEqual({ action: 'preserved', changed: false });
        if (moved.annotation.subtype !== 'polygon') throw new Error('expected a polygon');
        expect(moved.annotation.rotation).toBe(90);
        expect(near(moved.annotation.rect.x, polygon.rect.x + d.x)).toBe(true);
        expect(near(moved.annotation.rect.y, polygon.rect.y + d.y)).toBe(true);

        // A new turn keeps the points upright and draws them again.
        const turned = await page.annotations.update(polygon.ref, {
          subtype: 'polygon',
          vertices,
          rotation: 45,
        });
        expect(turned.appearance.action === 'preserved').toBe(false);
        if (turned.annotation.subtype !== 'polygon') throw new Error('expected a polygon');
        expect(turned.annotation.rotation).toBe(45);
        expectPoints(turned.annotation.vertices, vertices);

        // Null straightens the points where they are.
        const straightened = await page.annotations.update(polygon.ref, {
          subtype: 'polygon',
          rotation: null,
        });
        if (straightened.annotation.subtype !== 'polygon') throw new Error('expected a polygon');
        expect(straightened.annotation.rotation).toBe(null);
        expectPoints(straightened.annotation.vertices, vertices);
        expectPoints(drawnPointsOf(straightened.annotation)![0]!, vertices);
      } finally {
        await doc.close();
      }
    });

    test("a note's icon fills its rect, and moves and grows with it", async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const rect = iconRect(shapeRect.x, shapeRect.y);
        const created = await page.annotations.create({
          subtype: 'text',
          rect,
          icon: 'comment',
        } satisfies TextDraft);
        const note = created.annotation;
        if (note.subtype !== 'text') throw new Error('expected a note');
        expect(note.rect).toEqual(rect);

        // A move keeps the drawing: the icon only moves.
        const to = iconRect(rect.x + 30, rect.y + 15);
        const moved = await page.annotations.update(note.ref, { subtype: 'text', rect: to });
        expect(moved.annotation.rect).toEqual(to);
        expect(moved.appearance.changed).toBe(false);

        // A bigger rect is a bigger icon, drawn again.
        const bigger = { ...to, width: 50, height: 50 };
        const grown = await page.annotations.update(note.ref, { subtype: 'text', rect: bigger });
        expect(grown.annotation.rect).toEqual(bigger);
        expect(grown.appearance.changed).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test("a new rect puts a drawing there, as a script's annot.rect does in Acrobat", async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const offset = (r: PageBox, dx: number, dy: number): PageBox => ({
          ...r,
          x: r.x + dx,
          y: r.y + dy,
        });
        const expectPoint = (actual: PagePoint, expected: PagePoint) => {
          expect(near(actual.x, expected.x) && near(actual.y, expected.y)).toBe(true);
        };
        const expectRect = (actual: PageBox, expected: PageBox) => {
          expectPoint(actual, expected);
          expectPoint(
            { x: actual.width, y: actual.height },
            { x: expected.width, y: expected.height },
          );
        };
        const refused = { code: EngineErrorCode.InvalidArg, details: { field: 'rect' } };

        const created = (
          await page.annotations.create({
            subtype: 'line',
            linePoints,
            color: '#000000',
          } satisfies LineDraft)
        ).annotation;
        if (created.subtype !== 'line') throw new Error('expected a line');

        // Moved 40 right and 20 down: the points move by the offset, and the rect with them.
        const movedTo = offset(created.rect, 40, 20);
        const moved = await page.annotations.update(created.ref, {
          subtype: 'line',
          rect: movedTo,
        });
        if (moved.annotation.subtype !== 'line') throw new Error('expected a line');
        expectRect(moved.annotation.rect, movedTo);
        expectPoint(moved.annotation.linePoints.start, {
          x: linePoints.start.x + 40,
          y: linePoints.start.y + 20,
        });
        expectPoint(moved.annotation.linePoints.end, {
          x: linePoints.end.x + 40,
          y: linePoints.end.y + 20,
        });
        expect(moved.appearance.changed).toBe(false);

        // Stretched 60 wider and 30 taller, right and down: each axis on its
        // own, from the rect it had onto the new one.
        const from = moved.annotation.rect;
        const to = { ...from, width: from.width + 60, height: from.height + 30 };
        const onto = (point: PagePoint): PagePoint => ({
          x: to.x + ((point.x - from.x) * to.width) / from.width,
          y: to.y + ((point.y - from.y) * to.height) / from.height,
        });
        const stretched = await page.annotations.update(created.ref, { subtype: 'line', rect: to });
        if (stretched.annotation.subtype !== 'line') throw new Error('expected a line');
        expectPoint(stretched.annotation.linePoints.start, onto(moved.annotation.linePoints.start));
        expectPoint(stretched.annotation.linePoints.end, onto(moved.annotation.linePoints.end));
        expect(stretched.appearance.changed).toBe(true);

        // The rect it read, sent back, changes nothing.
        const back = await page.annotations.update(created.ref, {
          subtype: 'line',
          rect: stretched.annotation.rect,
          contents: 'sent back',
        });
        if (back.annotation.subtype !== 'line') throw new Error('expected a line');
        expect(back.annotation.rect).toEqual(stretched.annotation.rect);
        expect(back.annotation.linePoints).toEqual(stretched.annotation.linePoints);
        expect(back.annotation.contents).toBe('sent back');

        // A new rect with new points: which of the two to follow would be a guess.
        const rect = back.annotation.rect;
        await expect(
          page.annotations.update(created.ref, {
            subtype: 'line',
            rect: offset(rect, 5, 5),
            linePoints: { start: linePoints.start, end: { x: 90, y: 90 } },
          }),
        ).rejects.toMatchObject(refused);
        // A rect with no width.
        await expect(
          page.annotations.update(created.ref, {
            subtype: 'line',
            rect: { ...rect, width: 0 },
          }),
        ).rejects.toMatchObject(refused);

        // Text markup: the quads move, and the rect with them.
        const highlight = (
          await page.annotations.create({
            subtype: 'highlight',
            quadPoints: quad,
            color: '#ffff00',
          } satisfies HighlightDraft)
        ).annotation;
        const highlightTo = offset(highlight.rect, 10, 15);
        const movedHighlight = await page.annotations.update(highlight.ref, {
          subtype: 'highlight',
          rect: highlightTo,
        });
        if (movedHighlight.annotation.subtype !== 'highlight')
          throw new Error('expected a highlight');
        expectRect(movedHighlight.annotation.rect, highlightTo);
        expectPoint(movedHighlight.annotation.quadPoints[0]!.p1, {
          x: quad[0]!.p1.x + 10,
          y: quad[0]!.p1.y + 15,
        });

        // A turned drawing only moves.
        const turned = (
          await page.annotations.create({
            subtype: 'square',
            box: shapeRect,
            rotation: 30,
            color: '#0000ff',
          } satisfies SquareDraft)
        ).annotation;
        if (turned.subtype !== 'square') throw new Error('expected a square');
        const turnedTo = offset(turned.rect, 25, 5);
        const movedTurned = await page.annotations.update(turned.ref, {
          subtype: 'square',
          rect: turnedTo,
        });
        if (movedTurned.annotation.subtype !== 'square') throw new Error('expected a square');
        expectRect(movedTurned.annotation.box, offset(shapeRect, 25, 5));
        expect(movedTurned.annotation.rotation).toBe(30);
        await expect(
          page.annotations.update(turned.ref, {
            subtype: 'square',
            rect: { ...turnedTo, width: turnedTo.width + 20 },
          }),
        ).rejects.toMatchObject(refused);
      } finally {
        await doc.close();
      }
    });

    test('create vertex + line annotations (polygon/polyline/line) round-trip geometry', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));

        const polygonDraft: PolygonDraft = {
          subtype: 'polygon',
          contents: 'mutation conformance: polygon',
          vertices,
          interiorColor: '#ffc800',
          color: '#0000ff',
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 0.8,
        };
        const polygon = await page.annotations.create(polygonDraft);
        expect(AnnotationCreateResultSchema.safeParse(polygon).success).toBe(true);
        expect(polygon.annotation.subtype).toBe('polygon');
        if (polygon.annotation.subtype === 'polygon') {
          expect(polygon.annotation.vertices.length).toBe(vertices.length);
          expect(polygon.annotation.color).toBe('#0000ff');
          expect(polygon.annotation.interiorColor).toBe('#ffc800');
        }

        const polylineDraft: PolylineDraft = {
          subtype: 'polyline',
          contents: 'mutation conformance: polyline',
          vertices,
          interiorColor: null,
          color: '#c80000',
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
          lineEndings: { start: 'open-arrow', end: 'closed-arrow' },
        };
        const polyline = await page.annotations.create(polylineDraft);
        expect(AnnotationCreateResultSchema.safeParse(polyline).success).toBe(true);
        expect(polyline.annotation.subtype).toBe('polyline');
        if (polyline.annotation.subtype === 'polyline') {
          expect(polyline.annotation.vertices.length).toBe(vertices.length);
          expect(polyline.annotation.lineEndings.start).toBe('open-arrow');
          expect(polyline.annotation.lineEndings.end).toBe('closed-arrow');
        }

        const lineDraft: LineDraft = {
          subtype: 'line',
          contents: 'mutation conformance: line',
          linePoints,
          interiorColor: null,
          color: '#008080',
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
          lineEndings: { start: 'none', end: 'open-arrow' },
        };
        const line = await page.annotations.create(lineDraft);
        expect(AnnotationCreateResultSchema.safeParse(line).success).toBe(true);
        expect(line.annotation.subtype).toBe('line');
        if (line.annotation.subtype === 'line') {
          // /L stored as f32 — compare rounded to absorb float drift.
          expect(Math.round(line.annotation.linePoints.start.x)).toBe(
            Math.round(linePoints.start.x),
          );
          expect(Math.round(line.annotation.linePoints.end.y)).toBe(Math.round(linePoints.end.y));
          expect(line.annotation.lineEndings.end).toBe('open-arrow');
        }

        const inkDraft: InkDraft = {
          subtype: 'ink',
          contents: 'mutation conformance: ink',
          inkList: inkStrokes,
          color: '#1d4ed8',
          strokeWidth: 3,
          borderStyle: 'solid',
          opacity: 1,
        };
        const ink = await page.annotations.create(inkDraft);
        expect(AnnotationCreateResultSchema.safeParse(ink).success).toBe(true);
        expect(ink.annotation.subtype).toBe('ink');
        if (ink.annotation.subtype === 'ink') {
          expect(ink.annotation.inkList.length).toBe(inkStrokes.length);
          expect(ink.annotation.inkList[0]!.length).toBe(inkStrokes[0]!.length);
          expect(ink.annotation.color).toBe('#1d4ed8');
          expect(ink.annotation.intent).toBe(null);
          expect(ink.annotation.blendMode).toBe('normal');
          // Ink has a stroke but no /IC.
          expect('interiorColor' in ink.annotation).toBe(false);
        }

        const after = await page.annotations.list();
        const subtypes = after.annotations.map((a) => a.subtype);
        expect(subtypes.includes('polygon')).toBe(true);
        expect(subtypes.includes('polyline')).toBe(true);
        expect(subtypes.includes('line')).toBe(true);
        expect(subtypes.includes('ink')).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('create free-text + callout round-trip text/colour/intent fields', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));

        // Plain free text: `color` is the border; the text is black unless
        // `fontColor` says otherwise.
        const freeTextDraft: FreeTextDraft = {
          subtype: 'free-text',
          intent: 'free-text',
          contents: 'mutation conformance: free text',
          box: shapeRect,
          fontFamily: 'helvetica',
          fontSize: 14,
          textAlign: 'center',
          color: '#14283c',
          interiorColor: '#fafad2',
          opacity: 1,
          strokeWidth: 1,
          borderStyle: 'solid',
        };
        const freeText = await page.annotations.create(freeTextDraft);
        expect(AnnotationCreateResultSchema.safeParse(freeText).success).toBe(true);
        expect(freeText.annotation.subtype).toBe('free-text');
        if (freeText.annotation.subtype === 'free-text') {
          expect(freeText.annotation.intent).toBe('free-text');
          expect(freeText.annotation.fontFamily).toBe('helvetica');
          expect(freeText.annotation.fontSize).toBe(14);
          expect(freeText.annotation.textAlign).toBe('center');
          expect(freeText.annotation.color).toBe('#14283c');
          expect(freeText.annotation.interiorColor).toBe('#fafad2');
          expect(freeText.annotation.fontColor).toBe('#000000');
        }

        // Callout: intent + /CL leader + /LE ending, its own text color,
        // transparent (null) background.
        const calloutDraft: FreeTextDraft = {
          subtype: 'free-text',
          intent: 'free-text-callout',
          contents: 'mutation conformance: callout',
          box: shapeRect,
          fontFamily: 'times-roman',
          fontSize: 12,
          textAlign: 'left',
          color: '#000000',
          fontColor: '#c80000',
          interiorColor: null,
          opacity: 1,
          strokeWidth: 1,
          borderStyle: 'solid',
          calloutLine: DEFAULT_CALLOUT_LINE,
          lineEnding: 'open-arrow',
        };
        const callout = await page.annotations.create(calloutDraft);
        expect(AnnotationCreateResultSchema.safeParse(callout).success).toBe(true);
        expect(callout.annotation.subtype).toBe('free-text');
        if (callout.annotation.subtype === 'free-text') {
          expect(callout.annotation.intent).toBe('free-text-callout');
          expect(callout.annotation.interiorColor).toBe(null);
          expect(callout.annotation.fontColor).toBe('#c80000');
          expect(callout.annotation.color).toBe('#000000');
          expect(callout.annotation.calloutLine?.length).toBe(DEFAULT_CALLOUT_LINE.length);
          expect(callout.annotation.lineEnding).toBe('open-arrow');
          // The box is the text box; `rect` holds it, the line and its arrow.
          expect(callout.annotation.box).toEqual(shapeRect);
          const { rect } = callout.annotation;
          for (const point of DEFAULT_CALLOUT_LINE) {
            expect(point.x >= rect.x && point.x <= rect.x + rect.width).toBe(true);
            expect(point.y >= rect.y && point.y <= rect.y + rect.height).toBe(true);
          }
        }

        const after = await page.annotations.list();
        const freeTexts = after.annotations.filter((a) => a.subtype === 'free-text');
        expect(freeTexts.length >= 2).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('update a free-text patches alignment + colours and is non-structural', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'free-text',
          intent: 'free-text',
          contents: 'free-text-update-base',
          box: shapeRect,
          fontFamily: 'helvetica',
          fontSize: 12,
          textAlign: 'left',
          color: '#000000',
          interiorColor: null,
          opacity: 1,
          strokeWidth: 1,
          borderStyle: 'solid',
        } satisfies FreeTextDraft);
        const before = await page.annotations.list();

        const result = await page.annotations.update(created.annotation.ref, {
          subtype: 'free-text',
          textAlign: 'right',
          fontFamily: 'helvetica',
          fontSize: 18,
          color: '#0050a0',
          interiorColor: '#f0f0f0',
        });
        expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
        expect(result.annotation.subtype).toBe('free-text');
        if (result.annotation.subtype === 'free-text') {
          expect(result.annotation.textAlign).toBe('right');
          expect(result.annotation.fontSize).toBe(18);
          expect(result.annotation.color).toBe('#0050a0');
          expect(result.annotation.interiorColor).toBe('#f0f0f0');
        }
        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pages[0].revision.generation,
        );
        expect(result.meta.weakRefsInvalidated).toBe(false);
      } finally {
        await doc.close();
      }
    });

    // ── rich text (/RC + /DS): the same document model on every engine ──
    // `richText` is a body (family/weight/italic/size/colour/decoration/
    // align/dir) plus paragraphs of runs whose `style` overrides it. Every
    // FreeText reads it back; a draft or patch may write it. The rules under
    // test are the engine's patch table, so the cloud (HTTP -> server ->
    // native runtime) and the local WASM engine must agree row for row.

    test('rich text: a plain draft reads back body-style paragraphs and a body from its font', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'free-text',
          intent: 'free-text',
          contents: 'Plain\rtext',
          box: shapeRect,
          fontFamily: 'helvetica-bold',
          fontSize: 18,
          textAlign: 'center',
          color: '#000000',
        } satisfies FreeTextDraft);
        expect(created.annotation.subtype).toBe('free-text');
        if (created.annotation.subtype === 'free-text') {
          const rich = created.annotation.richText;
          expect(created.annotation.fontFamily).toBe('helvetica-bold');
          expect(rich.body.family).toBe('Helvetica');
          expect(rich.body.weight).toBe(700);
          expect(rich.body.italic).toBe(false);
          expect(rich.body.size).toBe(18);
          expect(rich.body.align).toBe('center');
          // One paragraph per line break, one unstyled run each; a paragraph
          // names alignment only where it differs from the body.
          expect(rich.paragraphs).toEqual([
            { runs: [{ text: 'Plain' }] },
            { runs: [{ text: 'text' }] },
          ]);
        }
      } finally {
        await doc.close();
      }
    });

    test('rich text: a draft with runs round-trips the body, the runs and the plain projection', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'free-text',
          intent: 'free-text',
          box: shapeRect,
          color: '#0000ff',
          // The body carries the size; a `fontSize` beside it would win.
          richText: {
            body: { family: 'Helvetica', size: 18, color: '#102030' },
            paragraphs: [
              {
                runs: [
                  { text: 'Hello ' },
                  { text: 'bold', style: { weight: 700 } },
                  { text: ' red', style: { color: '#FF0000' } },
                ],
              },
              { align: 'center', runs: [{ text: 'H' }, { text: '2', style: { script: 'sub' } }] },
            ],
          },
        } satisfies FreeTextDraft);
        expect(AnnotationCreateResultSchema.safeParse(created).success).toBe(true);
        expect(created.annotation.subtype).toBe('free-text');
        if (created.annotation.subtype === 'free-text') {
          const dto = created.annotation;
          // `contents` is the projection: paragraphs joined by \r, runs concatenated.
          expect(dto.contents).toBe('Hello bold red\rH2');
          // The body became the /DA font and size; the /DA colour, the border's,
          // stayed the draft's, and the text is the body's color.
          expect(dto.fontFamily).toBe('helvetica');
          expect(dto.fontSize).toBe(18);
          expect(dto.color).toBe('#0000ff');
          expect(dto.fontColor).toBe('#102030');
          expect(dto.richText.body.color).toBe('#102030');
          expect(dto.richText.paragraphs[0]!.runs).toEqual([
            { text: 'Hello ' },
            { text: 'bold', style: { weight: 700 } },
            { text: ' red', style: { color: '#ff0000' } },
          ]);
          expect(dto.richText.paragraphs[1]!.align).toBe('center');
          expect(dto.richText.paragraphs[1]!.runs[1]).toEqual({
            text: '2',
            style: { script: 'sub' },
          });
        }
        // The list read agrees with the create echo.
        const listed = (await page.annotations.list()).annotations.find(
          (a) => a.index === created.annotation.index,
        );
        expect(listed?.subtype).toBe('free-text');
        if (listed?.subtype === 'free-text') {
          expect(listed.richText.paragraphs[0]!.runs[1]).toEqual({
            text: 'bold',
            style: { weight: 700 },
          });
        }
      } finally {
        await doc.close();
      }
    });

    test('rich text: paragraphs-only patch keeps the body; contents-only rewrites body-style paragraphs', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'free-text',
          intent: 'free-text',
          box: shapeRect,
          fontFamily: 'helvetica',
          fontSize: 14,
          textAlign: 'center',
          color: '#000000',
          richText: {
            body: { family: 'Helvetica', size: 14 },
            paragraphs: [{ runs: [{ text: 'a' }, { text: 'b', style: { weight: 700 } }] }],
          },
        } satisfies FreeTextDraft);
        const ref = created.annotation.ref;
        // The editor's commit: paragraphs only, no body — the body (and its
        // alignment) stays what the annotation had.
        const restyled = await page.annotations.update(ref, {
          subtype: 'free-text',
          richText: {
            paragraphs: [{ runs: [{ text: 'ab', style: { italic: true } }, { text: 'c' }] }],
          },
        });
        expect(AnnotationUpdateResultSchema.safeParse(restyled).success).toBe(true);
        expect(restyled.annotation.subtype).toBe('free-text');
        if (restyled.annotation.subtype === 'free-text') {
          expect(restyled.annotation.contents).toBe('abc');
          expect(restyled.annotation.richText.body.size).toBe(14);
          expect(restyled.annotation.richText.body.align).toBe('center');
          expect(restyled.annotation.textAlign).toBe('center');
          expect(restyled.annotation.richText.paragraphs[0]!.runs[0]).toEqual({
            text: 'ab',
            style: { italic: true },
          });
        }
        // A plain-text client's rewrite: body-style paragraphs, one per line
        // break — run formatting is gone by design.
        const rewritten = await page.annotations.update(ref, {
          subtype: 'free-text',
          contents: 'one\rtwo',
        });
        expect(rewritten.annotation.subtype).toBe('free-text');
        if (rewritten.annotation.subtype === 'free-text') {
          expect(rewritten.annotation.contents).toBe('one\rtwo');
          expect(rewritten.annotation.richText.paragraphs).toEqual([
            { runs: [{ text: 'one' }] },
            { runs: [{ text: 'two' }] },
          ]);
          expect(rewritten.annotation.richText.body.size).toBe(14);
        }
        expect(rewritten.meta.weakRefsInvalidated).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('rich text: fontSize / fontColor / fontFamily move the body while runs keep their deltas', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'free-text',
          intent: 'free-text',
          box: shapeRect,
          fontFamily: 'helvetica',
          fontSize: 14,
          textAlign: 'left',
          color: '#000000',
          richText: {
            body: { family: 'Helvetica', size: 14 },
            paragraphs: [{ runs: [{ text: 'a' }, { text: 'b', style: { size: 30 } }] }],
          },
        } satisfies FreeTextDraft);
        const updated = await page.annotations.update(created.annotation.ref, {
          subtype: 'free-text',
          fontSize: 20,
          fontColor: '#ff0000',
          fontFamily: 'times-bold',
        });
        expect(updated.annotation.subtype).toBe('free-text');
        if (updated.annotation.subtype === 'free-text') {
          const dto = updated.annotation;
          expect(dto.fontSize).toBe(20);
          expect(dto.fontFamily).toBe('times-bold');
          expect(dto.richText.body.size).toBe(20);
          expect(dto.richText.body.color).toBe('#ff0000');
          expect(dto.richText.body.family).toBe('Times');
          expect(dto.richText.body.weight).toBe(700);
          // The run's own size is a delta over the body: it survives the move.
          expect(dto.richText.paragraphs[0]!.runs[1]).toEqual({ text: 'b', style: { size: 30 } });
        }
      } finally {
        await doc.close();
      }
    });

    test('rich text: contents and richText that disagree reject with InvalidArg; agreeing writes the runs', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'free-text',
          intent: 'free-text',
          contents: 'x',
          box: shapeRect,
          fontFamily: 'helvetica',
          fontSize: 14,
          textAlign: 'left',
          color: '#000000',
        } satisfies FreeTextDraft);
        const ref = created.annotation.ref;
        let caught: unknown;
        try {
          await page.annotations.update(ref, {
            subtype: 'free-text',
            contents: 'stale',
            richText: { paragraphs: [{ runs: [{ text: 'fresh' }] }] },
          });
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
        // The refused write left the annotation untouched.
        const after = (await page.annotations.list()).annotations.find(
          (a) => a.index === created.annotation.index,
        );
        expect(after?.contents).toBe('x');
        const agreed = await page.annotations.update(ref, {
          subtype: 'free-text',
          contents: 'fresh',
          richText: {
            paragraphs: [{ runs: [{ text: 'fr' }, { text: 'esh', style: { weight: 700 } }] }],
          },
        });
        expect(agreed.annotation.subtype).toBe('free-text');
        if (agreed.annotation.subtype === 'free-text') {
          expect(agreed.annotation.contents).toBe('fresh');
          expect(agreed.annotation.richText.paragraphs[0]!.runs[1]).toEqual({
            text: 'esh',
            style: { weight: 700 },
          });
        }
      } finally {
        await doc.close();
      }
    });

    test('create redact (area + text) round-trips label + colour fields', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));

        // Area redaction (no quads: /Rect is the removal region) with a
        // fully-styled label.
        const areaDraft: RedactDraft = {
          subtype: 'redact',
          contents: 'mutation conformance: area redact',
          rect: shapeRect,
          color: '#e44234',
          opacity: 1,
          interiorColor: '#000000',
          overlayText: 'CONFIDENTIAL',
          repeat: true,
          fontFamily: 'helvetica',
          fontSize: 10,
          fontColor: '#ffffff',
          textAlign: 'center',
        };
        const area = await page.annotations.create(areaDraft);
        expect(AnnotationCreateResultSchema.safeParse(area).success).toBe(true);
        expect(area.annotation.subtype).toBe('redact');
        if (area.annotation.subtype === 'redact') {
          expect(area.annotation.quadPoints.length).toBe(0);
          expect(area.annotation.color).toBe('#e44234');
          expect(area.annotation.interiorColor).toBe('#000000');
          expect(area.annotation.overlayText).toBe('CONFIDENTIAL');
          expect(area.annotation.repeat).toBe(true);
          expect(area.annotation.fontFamily).toBe('helvetica');
          expect(area.annotation.fontSize).toBe(10);
          expect(area.annotation.fontColor).toBe('#ffffff');
          expect(area.annotation.textAlign).toBe('center');
        }

        // Text redaction (quads) without a label: everything falls back to
        // the ISO defaults — transparent fill, no overlay text, no repeat.
        const textDraft: RedactDraft = {
          subtype: 'redact',
          contents: 'mutation conformance: text redact',
          rect: shapeRect,
          quadPoints: quad,
        };
        const text = await page.annotations.create(textDraft);
        expect(AnnotationCreateResultSchema.safeParse(text).success).toBe(true);
        expect(text.annotation.subtype).toBe('redact');
        if (text.annotation.subtype === 'redact') {
          expect(text.annotation.quadPoints.length).toBe(quad.length);
          expect(text.annotation.interiorColor).toBe(null);
          expect(text.annotation.overlayText).toBe(null);
          expect(text.annotation.repeat).toBe(false);
          // Default marking outline is the red redaction convention.
          expect(text.annotation.color).toBe('#ff0000');
        }
      } finally {
        await doc.close();
      }
    });

    test('update a redact patches the label and clears it, non-structurally', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'redact',
          contents: 'redact-update-base',
          rect: shapeRect,
          interiorColor: '#000000',
          overlayText: 'DRAFT',
          fontFamily: 'helvetica',
          fontSize: 8,
          fontColor: '#ffffff',
        } satisfies RedactDraft);
        const before = await page.annotations.list();

        // Restyle the label. fontSize 0 is meaningful for a redaction label
        // (auto-fit) and must round-trip verbatim, unlike free text.
        const restyled = await page.annotations.update(created.annotation.ref, {
          subtype: 'redact',
          overlayText: 'REDACTED',
          repeat: true,
          fontFamily: 'helvetica',
          fontSize: 0,
          fontColor: '#fff0f0',
          textAlign: 'right',
          interiorColor: '#0a0a0a',
        });
        expect(AnnotationUpdateResultSchema.safeParse(restyled).success).toBe(true);
        expect(restyled.annotation.subtype).toBe('redact');
        if (restyled.annotation.subtype === 'redact') {
          expect(restyled.annotation.overlayText).toBe('REDACTED');
          expect(restyled.annotation.repeat).toBe(true);
          expect(restyled.annotation.fontSize).toBe(0);
          expect(restyled.annotation.fontColor).toBe('#fff0f0');
          expect(restyled.annotation.textAlign).toBe('right');
          expect(restyled.annotation.interiorColor).toBe('#0a0a0a');
        }

        // Clear the label and the fill: null wipes /OverlayText and /IC.
        const cleared = await page.annotations.update(created.annotation.ref, {
          subtype: 'redact',
          overlayText: null,
          repeat: false,
          interiorColor: null,
        });
        expect(cleared.annotation.subtype).toBe('redact');
        if (cleared.annotation.subtype === 'redact') {
          expect(cleared.annotation.overlayText).toBe(null);
          expect(cleared.annotation.repeat).toBe(false);
          expect(cleared.annotation.interiorColor).toBe(null);
        }

        // Updates never bump the revision.
        expect(cleared.meta.affectedPages[0].revision.generation).toBe(
          before.pages[0].revision.generation,
        );
        expect(cleared.meta.weakRefsInvalidated).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('create + update a caret round-trips color/opacity and its box', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));

        const caretDraft: CaretDraft = {
          subtype: 'caret',
          intent: 'replace',
          contents: 'mutation conformance: caret',
          box: shapeRect,
          color: '#0080ff',
          opacity: 0.7,
        };
        const caret = await page.annotations.create(caretDraft);
        expect(AnnotationCreateResultSchema.safeParse(caret).success).toBe(true);
        expect(caret.annotation.subtype).toBe('caret');
        expect(caret.annotation.identityQuality).toBe('durable');
        expect(caret.annotation.ref.kind).toBe('objectNumber');
        if (caret.annotation.subtype === 'caret') {
          expect(caret.annotation.intent).toBe('replace');
          expect(caret.annotation.color).toBe('#0080ff');
          expect(Math.round(caret.annotation.opacity * 100) / 100).toBe(0.7);
          // Caret carries no border or quads.
          expect('strokeWidth' in caret.annotation).toBe(false);
          expect('quadPoints' in caret.annotation).toBe(false);
          // The symbol fills its box; `rect` holds its outline too.
          expect(caret.annotation.box).toEqual(shapeRect);
          const { rect } = caret.annotation;
          expect(rect.x <= shapeRect.x && rect.y <= shapeRect.y).toBe(true);
          expect(rect.x + rect.width >= shapeRect.x + shapeRect.width).toBe(true);
          expect(rect.y + rect.height >= shapeRect.y + shapeRect.height).toBe(true);
        }

        const before = await page.annotations.list();
        const result = await page.annotations.update(caret.annotation.ref, {
          subtype: 'caret',
          color: '#ff0000',
        });
        expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
        expect(result.annotation.subtype).toBe('caret');
        if (result.annotation.subtype === 'caret') {
          expect(result.annotation.color).toBe('#ff0000');
          expect(result.annotation.box).toEqual(shapeRect);
        }
        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pages[0].revision.generation,
        );
        expect(result.meta.weakRefsInvalidated).toBe(false);

        const after = await page.annotations.list();
        expect(after.annotations.some((a) => a.subtype === 'caret')).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('update an ink annotation patches strokes + color and is non-structural', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'ink',
          contents: 'ink-update-base',
          inkList: inkStrokes,
          color: '#000000',
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
        } satisfies InkDraft);
        const before = await page.annotations.list();

        const newStrokes: InkDraft['inkList'] = [
          ...inkStrokes,
          [
            { x: 80, y: 90 },
            { x: 120, y: 110 },
          ],
        ];
        const result = await page.annotations.update(created.annotation.ref, {
          subtype: 'ink',
          inkList: newStrokes,
          color: '#dc143c',
        });
        expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
        expect(result.annotation.subtype).toBe('ink');
        if (result.annotation.subtype === 'ink') {
          expect(result.annotation.inkList.length).toBe(newStrokes.length);
          expect(result.annotation.color).toBe('#dc143c');
        }
        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pages[0].revision.generation,
        );
        expect(result.meta.weakRefsInvalidated).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('ink highlight intent + blend round-trip and unrelated patches preserve blend', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'ink',
          intent: 'ink-highlight',
          blendMode: 'multiply',
          inkList: inkStrokes,
          color: '#ffcd45',
          strokeWidth: 14,
          borderStyle: 'solid',
          opacity: 1,
        } satisfies InkDraft);
        expect(created.annotation.subtype).toBe('ink');
        if (created.annotation.subtype !== 'ink') return;
        expect(created.annotation.intent).toBe('ink-highlight');
        expect(created.annotation.blendMode).toBe('multiply');

        const recolored = await page.annotations.update(created.annotation.ref, {
          subtype: 'ink',
          color: '#fabe28',
        });
        expect(recolored.annotation.subtype).toBe('ink');
        expect(recolored.annotation.blendMode).toBe('multiply');

        const screened = await page.annotations.update(created.annotation.ref, {
          subtype: 'ink',
          blendMode: 'screen',
        });
        expect(screened.annotation.subtype).toBe('ink');
        expect(screened.annotation.blendMode).toBe('screen');
      } finally {
        await doc.close();
      }
    });

    test('update a polyline patches vertices + line endings and is non-structural', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'polyline',
          contents: 'polyline-update-base',
          vertices,
          interiorColor: null,
          color: '#000000',
          strokeWidth: 1,
          borderStyle: 'solid',
          opacity: 1,
          lineEndings: { start: 'none', end: 'none' },
        } satisfies PolylineDraft);
        const before = await page.annotations.list();

        const newVertices: PagePoint[] = [
          ...vertices,
          { x: vertices[0]!.x + 5, y: vertices[0]!.y + 5 },
        ];
        const result = await page.annotations.update(created.annotation.ref, {
          subtype: 'polyline',
          vertices: newVertices,
          lineEndings: { start: 'circle', end: 'diamond' },
        });
        expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
        expect(result.annotation.subtype).toBe('polyline');
        if (result.annotation.subtype === 'polyline') {
          expect(result.annotation.vertices.length).toBe(newVertices.length);
          expect(result.annotation.lineEndings.start).toBe('circle');
          expect(result.annotation.lineEndings.end).toBe('diamond');
        }
        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pages[0].revision.generation,
        );
        expect(result.meta.weakRefsInvalidated).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('update a shape annotation patches color and is non-structural', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'circle',
          contents: 'shape-update-base',
          box: shapeRect,
          interiorColor: '#0a141e',
          color: '#000000',
          strokeWidth: 1,
          borderStyle: 'solid',
          opacity: 1,
        } satisfies CircleDraft);
        const before = await page.annotations.list();

        const result = await page.annotations.update(created.annotation.ref, {
          subtype: 'circle',
          interiorColor: '#c86432',
          strokeWidth: 4,
        });
        expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
        expect(result.annotation.subtype).toBe('circle');
        if (result.annotation.subtype === 'circle') {
          expect(result.annotation.interiorColor).toBe('#c86432');
          expect(result.annotation.strokeWidth).toBe(4);
          // Unpatched fields are preserved.
          expect(result.annotation.borderStyle).toBe('solid');
        }
        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pages[0].revision.generation,
        );
        expect(result.meta.weakRefsInvalidated).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('creating a shape bakes an /AP appearance the reader can rasterize', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'circle',
          contents: 'appearance-gen',
          box: shapeRect,
          interiorColor: '#ff0000',
          color: '#000000',
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
        } satisfies CircleDraft);

        // The freshly created shape must carry a baked /AP (generated by
        // the mutator), so the appearance reader draws a non-empty raster.
        const raster = await appearanceRaster(page, created.annotation.ref);
        expect(raster.width > 0).toBeTruthy();
        expect(raster.height > 0).toBeTruthy();
      } finally {
        await doc.close();
      }
    });

    test('update on a durable annotation is non-structural and never touches /NM', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const before = await page.annotations.list();

        const target = before.annotations.find((a) => a.identityQuality === 'durable');
        // Skip the assertion gracefully if the fixture has no durable annot
        // up front; the test fixture used in our suites does (the existing
        // highlights have /NM).
        if (!target) return;

        const ref: AnnotationRef = target.ref;
        const newContents = `mutation conformance: updated@${Date.now()}`;
        const patch = subtypeAwarePatch(target.subtype, newContents);
        if (!patch) return;

        const result = await page.annotations.update(ref, patch);
        expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
        expect(result.meta.affectedPages.length).toBe(1);
        expect(result.meta.affectedPages[0].page.objectNumber).toBe(fix.pageObjectNumber);
        expect('cacheDelta' in result.meta).toBe(true);

        // Same identity, /NM untouched.
        expect(result.annotation.ref.kind).toBe(target.ref.kind);
        expect(result.annotation.nm).toBe(target.nm);

        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pages[0].revision.generation,
        );
        expect(result.meta.shouldRefetch).toBe(null);
        expect(result.meta.weakRefsInvalidated).toBe(false);

        // Round-trip the new contents.
        expect(result.annotation.contents).toBe(newContents);
      } finally {
        await doc.close();
      }
    });

    if (fix.expectsWeakAnnotation) {
      test('update on a weak annotation stamps a UUID v4 /NM and upgrades the ref', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const page = doc.page(toPageRef(fix.pageObjectNumber));
          const before = await page.annotations.list();

          const weak = before.annotations.find((a) => a.identityQuality === 'weak');
          expect(weak !== undefined).toBe(true);
          if (!weak) return;
          expect(weak.ref.kind).toBe('index');

          const newContents = `weak-upgrade@${Date.now()}`;
          const patch = subtypeAwarePatch(weak.subtype, newContents);
          if (!patch) return;

          const result = await page.annotations.update(weak.ref, patch);
          expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
          expect(result.meta.affectedPages.length).toBe(1);
          expect(result.meta.affectedPages[0].page.objectNumber).toBe(fix.pageObjectNumber);
          expect('cacheDelta' in result.meta).toBe(true);

          // The ref is upgraded to durable. Either nm (engine-stamped) or
          // objectNumber (if the annotation surprisingly had one) is fine.
          expect(
            result.annotation.ref.kind === 'nm' || result.annotation.ref.kind === 'objectNumber',
          ).toBe(true);
          expect(result.annotation.identityQuality).toBe('durable');
          if (result.annotation.ref.kind === 'nm') {
            expect(result.annotation.nm !== null).toBe(true);
            expect(typeof result.annotation.nm).toBe('string');
            // Engine stamps RFC 4122 v4 UUIDs: 8-4-4-4-12 hex with
            // version 4 and variant 10xx. Match loosely.
            expect(
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
                result.annotation.nm!,
              ),
            ).toBe(true);
          }

          // Still non-structural.
          expect(result.meta.affectedPages[0].revision.generation).toBe(
            before.pages[0].revision.generation,
          );
          expect(result.meta.shouldRefetch).toBe(null);
        } finally {
          await doc.close();
        }
      });
    }

    test('delete by objectNumber removes the annotation and reports a stable id', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        // Create one we own so we don't disturb the fixture's other tests.
        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'mutation conformance: to-delete',
          quadPoints: quad,
        };
        const created = await page.annotations.create(draft);
        const before = await page.annotations.list();

        const weakSession = await beginEditIfRequired(doc, fix.pageObjectNumber, fix);
        const deletions: AnnotationStableId[][] = [];
        const stop = doc.events.subscribe((event) => {
          if (event.type === 'annotations.deleted') deletions.push(event.deleted);
        });
        const result = await page.annotations.delete(created.annotation.ref);
        stop();
        try {
          // Nothing exists after a delete: the result is its meta only, and
          // the event names what went, for listeners that didn't delete it.
          expect(Object.keys(result)).toEqual(['meta']);
          expect(deletions).toEqual([
            [
              {
                kind: 'objectNumber',
                objectNumber: (created.annotation.ref as { objectNumber: number }).objectNumber,
              },
            ],
          ]);
          expect(result.meta.affectedPages.length).toBe(1);
          expect(result.meta.affectedPages[0].page.objectNumber).toBe(fix.pageObjectNumber);
          expect('cacheDelta' in result.meta).toBe(true);

          // Its stable id is in meta (we created it; it's durable).
          expect(result.meta.changed).toHaveLength(1);
          expect(result.meta.changed[0]?.kind).toBe('objectNumber');

          // Structural: revision bumped.
          expect(result.meta.affectedPages[0].revision.generation).toBe(
            before.pages[0].revision.generation + 1,
          );

          // The annotation is gone.
          const after = await page.annotations.list();
          expect(after.annotations.length).toBe(before.annotations.length - 1);
        } finally {
          await weakSession?.close();
        }
      } finally {
        await doc.close();
      }
    });

    if (fix.expectsWeakAnnotation) {
      test('delete by index of a weak annotation reports no stable id and a refetch reason', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const page = doc.page(toPageRef(fix.pageObjectNumber));
          const before = await page.annotations.list();
          const weak = before.annotations.find((a) => a.identityQuality === 'weak');
          if (!weak) return;
          expect(weak.ref.kind).toBe('index');

          const weakSession = await beginEditIfRequired(doc, fix.pageObjectNumber, fix);
          const result = await page.annotations.delete(weak.ref);
          try {
            // The weak annotation may have had /NM in some shapes (very
            // legacy PDFs), but the locked semantics say a true weak
            // delete reports no stable id. We assert "none or a stable id"
            // since the fixture controls which side this lands on.
            expect(
              result.meta.changed.every((id) => id.kind === 'objectNumber' || id.kind === 'nm'),
            ).toBe(true);
            expect(result.meta.changed.length <= 1).toBe(true);
            expect(result.meta.affectedPages.length).toBe(1);
            expect(result.meta.affectedPages[0].page.objectNumber).toBe(fix.pageObjectNumber);
            expect('cacheDelta' in result.meta).toBe(true);

            // The page had weak refs before, structural mutation,
            // therefore: shouldRefetch is set.
            expect(result.meta.shouldRefetch?.reason).toBe('weakRefsInvalidated');
            expect(result.meta.weakRefsInvalidated).toBe(true);
          } finally {
            await weakSession?.close();
          }
        } finally {
          await doc.close();
        }
      });
    }

    test('abort on create rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'will be aborted',
          quadPoints: quad,
        };
        const p = page.annotations.create(draft);
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });

    test('update with a stale index revision throws InvalidReference', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const before = await page.annotations.list();
        const weak = before.annotations.find((a) => a.identityQuality === 'weak');
        if (!weak || weak.ref.kind !== 'index') return;

        // Force the revision out of date by minting an *index-shifting*
        // mutation, then trying to update against the stale ref. We
        // deliberately use a throwaway create+delete pair (delete is
        // the rev-bumping op now — create is append-only and does not
        // bump revisions, so it can't be used here).
        const throwaway = await page.annotations.create({
          subtype: 'highlight',
          contents: 'rev-bump-throwaway',
          quadPoints: quad,
        });
        const weakSession = await beginEditIfRequired(doc, fix.pageObjectNumber, fix);
        await page.annotations.delete(throwaway.annotation.ref);
        await weakSession?.close();

        const patch = subtypeAwarePatch(weak.subtype, 'should-fail');
        if (!patch) return;
        let caught: unknown;
        try {
          await page.annotations.update(weak.ref, patch);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidReference)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    // ─────────────────────────────────────────────────────────────────
    //  move() — batch contiguous-block reorder. Locked invariants:
    //  - `move([ref], toIndex)` is the single-annotation case; same
    //    primitive as multi-move.
    //  - One revision bump per batch, regardless of `refs.length`.
    //  - Caller-supplied order is preserved at the destination.
    //  - Weak refs in the batch are upgraded to durable /NM before the
    //    move; the moved DTOs come out durable and `meta.changed` lists
    //    stable ids.
    //  - Stale revision, out-of-range, duplicate, and abort all reject.
    // ─────────────────────────────────────────────────────────────────

    test('move single durable annotation reorders within the page (single-as-batch)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));

        // Seed two durable annotations we can predict ordering for.
        const aDraft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'move-a',
          quadPoints: quad,
        };
        const bDraft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'move-b',
          quadPoints: quad,
        };
        const a = await page.annotations.create(aDraft);
        const b = await page.annotations.create(bDraft);
        const list = await page.annotations.list();
        const beforeRev = list.pages[0].revision.generation;

        // Find current indices of a and b.
        const aIdx = list.annotations.findIndex(
          (x) =>
            x.ref.kind === 'objectNumber' &&
            a.annotation.ref.kind === 'objectNumber' &&
            x.ref.objectNumber === a.annotation.ref.objectNumber,
        );
        const bIdx = list.annotations.findIndex(
          (x) =>
            x.ref.kind === 'objectNumber' &&
            b.annotation.ref.kind === 'objectNumber' &&
            x.ref.objectNumber === b.annotation.ref.objectNumber,
        );
        expect(aIdx >= 0 && bIdx >= 0).toBe(true);
        expect(aIdx < bIdx).toBe(true);

        // Move A to B's slot. Post-removal index space: A was removed,
        // so B's position becomes bIdx - 1. Targeting bIdx puts A after
        // B's original position. Use `bIdx` as toIndex => A lands right
        // after B in the new order.
        const weakSession = await beginEditIfRequired(doc, fix.pageObjectNumber, fix);
        const result = await page.annotations.move([a.annotation.ref], bIdx);
        try {
          expect(AnnotationMoveResultSchema.safeParse(result).success).toBe(true);
          expect(result.meta.affectedPages.length).toBe(1);
          expect(result.meta.affectedPages[0].page.objectNumber).toBe(fix.pageObjectNumber);
          expect('cacheDelta' in result.meta).toBe(true);
          expect(result.annotations.length).toBe(1);

          // Single revision bump per batch.
          expect(result.meta.affectedPages[0].revision.generation).toBe(beforeRev + 1);

          // The moved DTO sits at toIndex.
          if (result.annotations[0].ref.kind === 'objectNumber') {
            const movedObjNum = result.annotations[0].ref.objectNumber;
            if (a.annotation.ref.kind === 'objectNumber') {
              expect(movedObjNum).toBe(a.annotation.ref.objectNumber);
            }
          }

          // Verify the page now has A at its new position.
          const after = await page.annotations.list();
          expect(after.annotations.length).toBe(list.annotations.length);
        } finally {
          await weakSession?.close();
        }
      } finally {
        await doc.close();
      }
    });

    test('move multi-block preserves caller-supplied order at the destination', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));

        // Seed three durable annotations.
        const ids = await Promise.all(
          ['multi-1', 'multi-2', 'multi-3'].map((label) =>
            page.annotations.create({
              subtype: 'highlight',
              contents: label,
              quadPoints: quad,
            }),
          ),
        );

        const list = await page.annotations.list();
        const beforeRev = list.pages[0].revision.generation;

        // Move the three to position 0 in caller order [3, 1, 2].
        const callerOrder = [ids[2].annotation.ref, ids[0].annotation.ref, ids[1].annotation.ref];
        const weakSession = await beginEditIfRequired(doc, fix.pageObjectNumber, fix);
        const result = await page.annotations.move(callerOrder, 0);
        try {
          // One revision bump even though three annotations moved.
          expect(result.meta.affectedPages[0].revision.generation).toBe(beforeRev + 1);
          expect(result.annotations.length).toBe(3);
          expect(result.meta.changed.length).toBe(3);

          // Caller-supplied order preserved at the destination. Indices
          // 0, 1, 2 of the page now hold the moved DTOs in that order.
          const expectedOrder = [
            ids[2].annotation.ref,
            ids[0].annotation.ref,
            ids[1].annotation.ref,
          ].map((r) => (r.kind === 'objectNumber' ? r.objectNumber : null));

          const movedObjNums = result.annotations.map((d) =>
            d.ref.kind === 'objectNumber' ? d.ref.objectNumber : null,
          );
          for (let i = 0; i < expectedOrder.length; i++) {
            expect(movedObjNums[i]).toBe(expectedOrder[i]);
          }
        } finally {
          await weakSession?.close();
        }
      } finally {
        await doc.close();
      }
    });

    if (fix.expectsWeakAnnotation) {
      test('move on a weak annotation upgrades it to durable /NM (one rev bump for batch)', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const page = doc.page(toPageRef(fix.pageObjectNumber));
          const before = await page.annotations.list();
          const weak = before.annotations.find((a) => a.identityQuality === 'weak');
          if (!weak || weak.ref.kind !== 'index') return;
          const beforeRev = before.pages[0].revision.generation;

          // Move the weak annotation to position 0 (or somewhere
          // non-trivial). The engine must stamp a fresh /NM before the
          // move so the result is durable.
          const target = weak.ref.index === 0 ? 1 : 0;
          const weakSession = await beginEditIfRequired(doc, fix.pageObjectNumber, fix);
          const result = await page.annotations.move([weak.ref], target);
          try {
            expect(result.meta.affectedPages[0].revision.generation).toBe(beforeRev + 1);
            expect(result.annotations.length).toBe(1);
            expect(result.annotations[0].identityQuality).toBe('durable');
            expect(
              result.annotations[0].ref.kind === 'nm' ||
                result.annotations[0].ref.kind === 'objectNumber',
            ).toBe(true);

            // meta.changed is a stable id, never a weak ref.
            expect(result.meta.changed.length).toBe(1);
            expect(
              result.meta.changed[0].kind === 'nm' ||
                result.meta.changed[0].kind === 'objectNumber',
            ).toBe(true);
          } finally {
            await weakSession?.close();
          }
        } finally {
          await doc.close();
        }
      });
    }

    test('move with a stale index revision rejects (locked rev-token guard)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const a = await page.annotations.create({
          subtype: 'highlight',
          contents: 'stale-a',
          quadPoints: quad,
        });
        const list = await page.annotations.list();
        const aIdx = list.annotations.findIndex(
          (x) =>
            x.ref.kind === 'objectNumber' &&
            a.annotation.ref.kind === 'objectNumber' &&
            x.ref.objectNumber === a.annotation.ref.objectNumber,
        );
        if (aIdx < 0) return;

        const staleIndexRef: AnnotationRef = {
          kind: 'index',
          page: toPageRef(fix.pageObjectNumber),
          index: aIdx,
          revision: list.pages[0].revision,
        };

        // Bump the revision by an unrelated index-shifting mutation.
        // create is append-only and no longer bumps revisions, so we
        // use a throwaway create+delete pair (the delete does the bump).
        const throwaway = await page.annotations.create({
          subtype: 'highlight',
          contents: 'bump-throwaway',
          quadPoints: quad,
        });
        const weakSession = await beginEditIfRequired(doc, fix.pageObjectNumber, fix);
        await page.annotations.delete(throwaway.annotation.ref);

        let caught: unknown;
        try {
          await page.annotations.move([staleIndexRef], 0);
        } catch (err) {
          caught = err;
        } finally {
          await weakSession?.close();
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidReference)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('move with out-of-range toIndex rejects with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const a = await page.annotations.create({
          subtype: 'highlight',
          contents: 'oor-a',
          quadPoints: quad,
        });
        const list = await page.annotations.list();
        const farTooBig = list.annotations.length + 100;
        const weakSession = await beginEditIfRequired(doc, fix.pageObjectNumber, fix);
        let caught: unknown;
        try {
          await page.annotations.move([a.annotation.ref], farTooBig);
        } catch (err) {
          caught = err;
        } finally {
          await weakSession?.close();
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('move with duplicate refs rejects with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const a = await page.annotations.create({
          subtype: 'highlight',
          contents: 'dup-a',
          quadPoints: quad,
        });
        const weakSession = await beginEditIfRequired(doc, fix.pageObjectNumber, fix);
        let caught: unknown;
        try {
          await page.annotations.move([a.annotation.ref, a.annotation.ref], 0);
        } catch (err) {
          caught = err;
        } finally {
          await weakSession?.close();
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('abort on move rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const a = await page.annotations.create({
          subtype: 'highlight',
          contents: 'abort-a',
          quadPoints: quad,
        });
        const weakSession = await beginEditIfRequired(doc, fix.pageObjectNumber, fix);
        const p = page.annotations.move([a.annotation.ref], 0);
        p.abort('test');
        try {
          await expect(p).rejects.toBeInstanceOf(AbortError);
        } finally {
          await weakSession?.close();
        }
      } finally {
        await doc.close();
      }
    });

    test('a page move does NOT bump per-page RevisionTokens (weak refs survive reorder)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 1) return;

        // Revision is annotation liveness, keyed by `pageObjectNumber`. A
        // page move is structural-geometry-only: no page's /Annots array is
        // touched, so no `RevisionToken` bumps and index-kind refs captured
        // before the reorder stay valid. We observe the host page's
        // revision via `annotations.list().pageState` (the move result no
        // longer carries liveness — it returns geometry).
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const beforeGen = (await page.annotations.list()).pages[0].revision.generation;

        // Pull some page to the front (prefer one that is not the host so
        // we exercise the cross-page case; fall back to the host itself for
        // single-page fixtures).
        const mover =
          list.pages.find((pg) => pg.ref.objectNumber !== fix.pageObjectNumber)?.ref ??
          toPageRef(fix.pageObjectNumber);
        await doc.pages.move([mover], 0);

        const afterGen = (await page.annotations.list()).pages[0].revision.generation;
        expect(afterGen).toBe(beforeGen);
      } finally {
        await doc.close();
      }
    });

    // ─────────────────────────────────────────────────────────────────
    //  /IRT + /RT relationships (reply vs group). Locked rules:
    //  - A draft `reply` writes /IRT; /RT defaults to 'reply' when
    //    `reply.type` is left out (ISO 32000 §12.5.6.2 default).
    //  - The DTO surfaces `reply` ({ to, type }); a top-level annotation
    //    reports `reply: null`.
    //  - Linking reports the (possibly strengthened) parent id in
    //    `meta.changed` and is non-structural (no rev bump / refetch).
    //  - A cross-page parent is rejected with InvalidArg.
    // ─────────────────────────────────────────────────────────────────

    test('create a reply links /IRT and defaults /RT to "reply", reporting the parent', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const parent = await page.annotations.create({
          subtype: 'highlight',
          contents: 'reply parent',
          quadPoints: quad,
        } satisfies HighlightDraft);
        // A freshly created top-level annotation has no relationship.
        expect(parent.annotation.reply).toBe(null);

        const reply = await page.annotations.create({
          subtype: 'highlight',
          contents: 'a reply',
          quadPoints: quad,
          reply: { to: parent.annotation.ref },
        } satisfies HighlightDraft);
        expect(AnnotationCreateResultSchema.safeParse(reply).success).toBe(true);
        // /RT absent in the draft normalizes to 'reply'.
        expect(reply.annotation.reply?.type).toBe('reply');
        expect(reply.annotation.reply?.to !== undefined).toBe(true);
        if (
          reply.annotation.reply?.to.kind === 'objectNumber' &&
          parent.annotation.ref.kind === 'objectNumber'
        ) {
          expect(reply.annotation.reply!.to.objectNumber).toBe(parent.annotation.ref.objectNumber);
          expect(reply.annotation.reply!.to.page.objectNumber).toBe(fix.pageObjectNumber);
        }
        // The parent (already durable) is reported alongside the new reply.
        expect(reply.meta.changed.length).toBe(2);
        // Linking is non-structural: no rev bump, no refetch.
        expect(reply.meta.shouldRefetch).toBe(null);
        expect(reply.meta.weakRefsInvalidated).toBe(false);

        // The relationship survives a fresh read.
        const after = await page.annotations.list();
        const readReply = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            reply.annotation.ref.kind === 'objectNumber' &&
            a.ref.objectNumber === reply.annotation.ref.objectNumber,
        );
        expect(readReply?.reply?.type).toBe('reply');
        expect(readReply?.reply?.to !== undefined).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('create a grouped subordinate writes /RT /Group', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const primary = await page.annotations.create({
          subtype: 'highlight',
          contents: 'group primary',
          quadPoints: quad,
        } satisfies HighlightDraft);

        const caret = await page.annotations.create({
          subtype: 'caret',
          contents: '',
          box: shapeRect,
          color: '#000000',
          opacity: 1,
          reply: { to: primary.annotation.ref, type: 'group' },
        } satisfies CaretDraft);
        expect(AnnotationCreateResultSchema.safeParse(caret).success).toBe(true);
        expect(caret.annotation.reply?.type).toBe('group');
        expect(caret.annotation.reply?.to !== undefined).toBe(true);

        const after = await page.annotations.list();
        const readCaret = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            caret.annotation.ref.kind === 'objectNumber' &&
            a.ref.objectNumber === caret.annotation.ref.objectNumber,
        );
        expect(readCaret?.reply?.type).toBe('group');
      } finally {
        await doc.close();
      }
    });

    // ─────────────────────────────────────────────────────────────────
    //  Link annotations. Locked rules:
    //  - `/Dest` and `/A GoTo` both read as the normalized `goto` arm;
    //    destinations carry page object numbers on the wire (never
    //    indices) and raw PDF user-space coordinates.
    //  - `target: null` creates a dead link (create-then-edit flow).
    //  - A patch retargets by replacing `/A`; the reader gives `/A`
    //    precedence so a retarget wins over any stray direct `/Dest`.
    //  - Grouped links ("attached links") are plain /IRT + /RT
    //    /Group — nothing link-specific in the relationship plane.
    // ─────────────────────────────────────────────────────────────────

    test('create link annotations round-trip uri, goto/xyz, goto/fitH, and dead targets', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));

        const uri = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: { kind: 'uri', uri: 'https://www.embedpdf.com/' },
        } satisfies LinkDraft);
        expect(AnnotationCreateResultSchema.safeParse(uri).success).toBe(true);
        expect(uri.annotation.subtype).toBe('link');
        if (uri.annotation.subtype === 'link') {
          expect(uri.annotation.target).toEqual({ kind: 'uri', uri: 'https://www.embedpdf.com/' });
        }

        // /XYZ with a null zoom axis: null means "retain current".
        const xyz = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: {
            kind: 'goto',
            destination: {
              kind: 'xyz',
              page: toPageRef(fix.pageObjectNumber),
              x: 30,
              y: 300,
              zoom: null,
            },
          },
        } satisfies LinkDraft);
        expect(xyz.annotation.subtype).toBe('link');
        if (xyz.annotation.subtype === 'link') {
          expect(xyz.annotation.target?.kind).toBe('goto');
          if (xyz.annotation.target?.kind === 'goto') {
            const dest = xyz.annotation.target.destination;
            expect(dest.kind).toBe('xyz');
            if (dest.kind === 'xyz') {
              expect(dest.page.objectNumber).toBe(fix.pageObjectNumber);
              expect(dest.x).toBe(30);
              expect(dest.y).toBe(300);
              expect(dest.zoom).toBe(null);
            }
          }
        }

        const fitH = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: {
            kind: 'goto',
            destination: { kind: 'fitH', page: toPageRef(fix.pageObjectNumber), y: 420 },
          },
        } satisfies LinkDraft);
        expect(fitH.annotation.subtype).toBe('link');
        if (fitH.annotation.subtype === 'link' && fitH.annotation.target?.kind === 'goto') {
          expect(fitH.annotation.target.destination).toEqual({
            kind: 'fitH',
            page: toPageRef(fix.pageObjectNumber),
            y: 420,
          });
        }

        // Dead link: legal to author, reported as-is.
        const dead = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: null,
        } satisfies LinkDraft);
        expect(dead.annotation.subtype).toBe('link');
        if (dead.annotation.subtype === 'link') expect(dead.annotation.target).toBe(null);

        // All four survive a fresh page read as link DTOs.
        const after = await page.annotations.list();
        const links = after.annotations.filter((a) => a.subtype === 'link');
        expect(links.length >= 4).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('a link patch retargets in both directions (uri→goto, goto→uri) and moves the rect', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: { kind: 'uri', uri: 'https://old.example/' },
        } satisfies LinkDraft);

        const toGoto = await page.annotations.update(created.annotation.ref, {
          subtype: 'link',
          target: {
            kind: 'goto',
            destination: { kind: 'fit', page: toPageRef(fix.pageObjectNumber) },
          },
        });
        expect(AnnotationUpdateResultSchema.safeParse(toGoto).success).toBe(true);
        if (toGoto.annotation.subtype === 'link') {
          expect(toGoto.annotation.target).toEqual({
            kind: 'goto',
            destination: { kind: 'fit', page: toPageRef(fix.pageObjectNumber) },
          });
        }

        const movedRect = { ...shapeRect, x: shapeRect.x + 5, y: shapeRect.y + 5 };
        const toUri = await page.annotations.update(created.annotation.ref, {
          subtype: 'link',
          rect: movedRect,
          target: { kind: 'uri', uri: 'https://new.example/' },
        });
        if (toUri.annotation.subtype === 'link') {
          expect(toUri.annotation.target).toEqual({ kind: 'uri', uri: 'https://new.example/' });
          expect(Math.round(toUri.annotation.rect.x)).toBe(Math.round(movedRect.x));
        }
      } finally {
        await doc.close();
      }
    });

    test('a link patch clears the target with null — a dead link on re-read', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const created = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: {
            kind: 'goto',
            destination: { kind: 'fit', page: toPageRef(fix.pageObjectNumber) },
          },
        } satisfies LinkDraft);

        const cleared = await page.annotations.update(created.annotation.ref, {
          subtype: 'link',
          target: null,
        });
        expect(AnnotationUpdateResultSchema.safeParse(cleared).success).toBe(true);
        if (cleared.annotation.subtype === 'link') expect(cleared.annotation.target).toBe(null);

        // Truly dead — a fresh page read agrees (both /A and /Dest gone).
        const after = await page.annotations.list();
        const readBack = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            created.annotation.ref.kind === 'objectNumber' &&
            a.ref.objectNumber === created.annotation.ref.objectNumber,
        );
        expect(readBack?.subtype).toBe('link');
        if (readBack?.subtype === 'link') expect(readBack.target).toBe(null);

        // And a cleared link can be re-targeted afterwards.
        const revived = await page.annotations.update(created.annotation.ref, {
          subtype: 'link',
          target: { kind: 'uri', uri: 'https://revived.example/' },
        });
        if (revived.annotation.subtype === 'link') {
          expect(revived.annotation.target).toEqual({
            kind: 'uri',
            uri: 'https://revived.example/',
          });
        }
      } finally {
        await doc.close();
      }
    });

    test('a link grouped to a highlight round-trips /IRT + /RT /Group with its target', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const parent = await page.annotations.create({
          subtype: 'highlight',
          contents: 'linked text',
          quadPoints: quad,
        } satisfies HighlightDraft);

        const link = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: { kind: 'uri', uri: 'https://www.embedpdf.com/docs' },
          reply: { to: parent.annotation.ref, type: 'group' },
        } satisfies LinkDraft);
        expect(AnnotationCreateResultSchema.safeParse(link).success).toBe(true);
        expect(link.annotation.reply?.type).toBe('group');
        expect(link.annotation.reply?.to !== undefined).toBe(true);
        if (
          link.annotation.reply?.to.kind === 'objectNumber' &&
          parent.annotation.ref.kind === 'objectNumber'
        ) {
          expect(link.annotation.reply!.to.objectNumber).toBe(parent.annotation.ref.objectNumber);
        }

        // Both the relationship and the target survive a fresh read.
        const after = await page.annotations.list();
        const readLink = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            link.annotation.ref.kind === 'objectNumber' &&
            a.ref.objectNumber === link.annotation.ref.objectNumber,
        );
        expect(readLink?.subtype).toBe('link');
        expect(readLink?.reply?.type).toBe('group');
        if (readLink?.subtype === 'link') {
          expect(readLink.target).toEqual({ kind: 'uri', uri: 'https://www.embedpdf.com/docs' });
        }
      } finally {
        await doc.close();
      }
    });

    test('replace-text round-trips /IT and groups StrikeOut under its Caret', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const caret = await page.annotations.create({
          subtype: 'caret',
          intent: 'replace',
          contents: 'replacement text',
          box: shapeRect,
          color: '#e44234',
          opacity: 1,
        } satisfies CaretDraft);
        const strikeout = await page.annotations.create({
          subtype: 'strikeout',
          intent: 'strikeout-text-edit',
          quadPoints: quad,
          color: '#e44234',
          opacity: 1,
          reply: { to: caret.annotation.ref, type: 'group' },
        } satisfies StrikeoutDraft);

        expect(caret.annotation.subtype).toBe('caret');
        if (caret.annotation.subtype === 'caret') expect(caret.annotation.intent).toBe('replace');
        expect(strikeout.annotation.subtype).toBe('strikeout');
        if (strikeout.annotation.subtype === 'strikeout') {
          expect(strikeout.annotation.intent).toBe('strikeout-text-edit');
        }
        expect(strikeout.annotation.reply?.type).toBe('group');
        expect(strikeout.annotation.reply?.to).toEqual(caret.annotation.ref);

        const after = await page.annotations.list();
        const readCaret = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            caret.annotation.ref.kind === 'objectNumber' &&
            a.ref.objectNumber === caret.annotation.ref.objectNumber,
        );
        const readStrikeout = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            strikeout.annotation.ref.kind === 'objectNumber' &&
            a.ref.objectNumber === strikeout.annotation.ref.objectNumber,
        );
        expect(readCaret?.subtype === 'caret' && readCaret.intent).toBe('replace');
        expect(readStrikeout?.subtype === 'strikeout' && readStrikeout.intent).toBe(
          'strikeout-text-edit',
        );
        expect(readStrikeout?.reply?.type).toBe('group');
        expect(readStrikeout?.reply?.to).toEqual(caret.annotation.ref);
      } finally {
        await doc.close();
      }
    });

    test('patch reply: null clears /IRT and /RT (back to top-level)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const parent = await page.annotations.create({
          subtype: 'highlight',
          contents: 'clear parent',
          quadPoints: quad,
        } satisfies HighlightDraft);
        const reply = await page.annotations.create({
          subtype: 'highlight',
          contents: 'clearable reply',
          quadPoints: quad,
          reply: { to: parent.annotation.ref },
        } satisfies HighlightDraft);
        expect(reply.annotation.reply?.type).toBe('reply');

        const cleared = await page.annotations.update(reply.annotation.ref, {
          subtype: 'highlight',
          reply: null,
        });
        expect(AnnotationUpdateResultSchema.safeParse(cleared).success).toBe(true);
        expect(cleared.annotation.reply).toBe(null);
      } finally {
        await doc.close();
      }
    });

    test('create with a cross-page /IRT parent throws InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const parent = await page.annotations.create({
          subtype: 'highlight',
          contents: 'cross-page parent',
          quadPoints: quad,
        } satisfies HighlightDraft);
        if (parent.annotation.ref.kind !== 'objectNumber') return;

        // Same annotation object number, but a deliberately different page:
        // the engine must reject before resolving anything (ISO requires
        // reply and parent on the same page).
        const crossPageRef: AnnotationRef = {
          kind: 'objectNumber',
          page: toPageRef(fix.pageObjectNumber + 2),
          objectNumber: parent.annotation.ref.objectNumber,
        };
        let caught: unknown;
        try {
          await page.annotations.create({
            subtype: 'highlight',
            contents: 'bad cross-page reply',
            quadPoints: quad,
            reply: { to: crossPageRef },
          } satisfies HighlightDraft);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('create refuses an nm already used on the page, naming the field', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const draft = { subtype: 'highlight', quadPoints: quad, nm: 'taken' } as const;
        await page.annotations.create(draft satisfies HighlightDraft);
        await expect(page.annotations.create(draft)).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
          details: { field: 'nm' },
        });
        // A name is unique per page (ISO 32000-2 §12.5.2): another page may use it.
        const { pages } = await doc.pages.list();
        const other = pages.find((entry) => entry.ref.objectNumber !== fix.pageObjectNumber);
        if (!other) return;
        const elsewhere = await doc.page(other.ref).annotations.create(draft);
        expect(elsewhere.annotation.nm).toBe('taken');
      } finally {
        await doc.close();
      }
    });

    // ─────────────────────────────────────────────────────────────────
    //  /State + /StateModel (review status, ISO 32000 §12.5.6.3) and
    //  /Subj. Locked rules:
    //  - A status change is a new text annotation replying to its target
    //    via /IRT; the target annotation itself is never modified.
    //  - Faithful reads: `state` / `stateModel` / `subject` are null iff
    //    the PDF entry is absent — a null after a null-clear patch proves
    //    true key removal (EPDFAnnot_RemoveKey), not an empty-string
    //    write.
    //  - Known review/marked values are wire-normalized to lowercase;
    //    custom Acrobat state models round-trip verbatim.
    //  - A draft `state` without `stateModel` is rejected with InvalidArg
    //    (ISO Table 175: StateModel is required when State is present).
    //  - State entries are appearance-inert: they never repaint anything.
    // ─────────────────────────────────────────────────────────────────

    test('a review-status reply round-trips /State + /StateModel + /Subj', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const target = await page.annotations.create({
          subtype: 'highlight',
          contents: 'status target',
          subject: 'Pricing question',
          quadPoints: quad,
        } satisfies HighlightDraft);
        expect(target.annotation.subject).toBe('Pricing question');

        const status = await page.annotations.create({
          subtype: 'text',
          rect: iconRect(shapeRect.x, shapeRect.y),
          reply: { to: target.annotation.ref },
          state: 'accepted',
          stateModel: 'review',
        } satisfies TextDraft);
        expect(AnnotationCreateResultSchema.safeParse(status).success).toBe(true);
        expect(status.annotation.subtype).toBe('text');
        if (status.annotation.subtype !== 'text') return;
        expect(status.annotation.state).toBe('accepted');
        expect(status.annotation.stateModel).toBe('review');
        // A state annotation is a reply like any other.
        expect(status.annotation.reply?.type).toBe('reply');

        // The entries survive a fresh read.
        const after = await page.annotations.list();
        const read = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            status.annotation.ref.kind === 'objectNumber' &&
            a.ref.objectNumber === status.annotation.ref.objectNumber,
        );
        expect(read?.subtype).toBe('text');
        if (read?.subtype === 'text') {
          expect(read.state).toBe('accepted');
          expect(read.stateModel).toBe('review');
        }
      } finally {
        await doc.close();
      }
    });

    test('a draft /State without /StateModel takes its standard model, or is refused', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const { annotation } = await page.annotations.create({
          subtype: 'text',
          rect: iconRect(shapeRect.x, shapeRect.y),
          state: 'accepted',
        } satisfies TextDraft);
        expect(annotation.subtype === 'text' && annotation.stateModel).toBe('review');
        let caught: unknown;
        try {
          await page.annotations.create({
            subtype: 'text',
            rect: iconRect(shapeRect.x, shapeRect.y),
            state: 'escalated',
          } satisfies TextDraft);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('null-clear patches truly remove /State, /StateModel, /Subj and /Contents', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const note = await page.annotations.create({
          subtype: 'text',
          rect: iconRect(shapeRect.x, shapeRect.y),
          contents: 'work in progress',
          subject: 'Draft',
          state: 'none',
          stateModel: 'review',
        } satisfies TextDraft);

        // Cycle the state alone — the model already on the annotation
        // stays; state entries never touch the appearance.
        const cycled = await page.annotations.update(note.annotation.ref, {
          subtype: 'text',
          state: 'rejected',
        } satisfies TextPatch);
        expect(cycled.appearance.changed).toBe(false);
        expect(cycled.annotation.subtype).toBe('text');
        if (cycled.annotation.subtype === 'text') {
          expect(cycled.annotation.state).toBe('rejected');
          expect(cycled.annotation.stateModel).toBe('review');
        }

        const cleared = await page.annotations.update(note.annotation.ref, {
          subtype: 'text',
          contents: null,
          subject: null,
          state: null,
          stateModel: null,
        } satisfies TextPatch);
        expect(cleared.appearance.changed).toBe(false);
        expect(cleared.annotation.contents).toBe(null);
        expect(cleared.annotation.subject).toBe(null);
        if (cleared.annotation.subtype === 'text') {
          expect(cleared.annotation.state).toBe(null);
          expect(cleared.annotation.stateModel).toBe(null);
        }

        // Faithful read: null distinguishes absent from ''. Null here
        // proves the entries were removed, not overwritten with an empty
        // string.
        const after = await page.annotations.list();
        const read = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            note.annotation.ref.kind === 'objectNumber' &&
            a.ref.objectNumber === note.annotation.ref.objectNumber,
        );
        expect(read?.contents).toBe(null);
        expect(read?.subject).toBe(null);
        if (read?.subtype === 'text') {
          expect(read.state).toBe(null);
          expect(read.stateModel).toBe(null);
        }
      } finally {
        await doc.close();
      }
    });

    test('custom state models round-trip verbatim', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(toPageRef(fix.pageObjectNumber));
        const custom = await page.annotations.create({
          subtype: 'text',
          rect: iconRect(shapeRect.x, shapeRect.y),
          state: 'in-progress',
          stateModel: 'X-ReviewWorkflow',
        } satisfies TextDraft);
        expect(custom.annotation.subtype).toBe('text');
        if (custom.annotation.subtype !== 'text') return;
        expect(custom.annotation.state).toBe('in-progress');
        expect(custom.annotation.stateModel).toBe('X-ReviewWorkflow');

        const after = await page.annotations.list();
        const read = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            custom.annotation.ref.kind === 'objectNumber' &&
            a.ref.objectNumber === custom.annotation.ref.objectNumber,
        );
        if (read?.subtype === 'text') {
          expect(read.state).toBe('in-progress');
          expect(read.stateModel).toBe('X-ReviewWorkflow');
        }
      } finally {
        await doc.close();
      }
    });
  });
}

async function beginEditIfRequired(
  doc: DocumentHandle,
  pageObjectNumber: number,
  fix: AnnotationMutationConformanceFixture,
): Promise<WeakAnnotationEditSession | null> {
  if (doc.capabilities.weakAnnotationEditSessions !== 'required' || !fix.expectsWeakAnnotation) {
    return null;
  }
  return doc.annotations.beginEdit([toPageRef(pageObjectNumber)]);
}

async function openFixture(
  engine: Engine,
  opts: AnnotationMutationConformanceOptions,
): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}

/**
 * Build a valid `AnnotationPatch` for the supplied subtype that mutates
 * a single field we can read back. Returns `null` for subtypes the
 * harness can't synthesise a patch for (e.g. unsupported); caller
 * gracefully skips.
 */
function subtypeAwarePatch(subtype: string, newContents: string): AnnotationPatch | null {
  switch (subtype) {
    case 'highlight':
    case 'underline':
    case 'squiggly':
    case 'strikeout':
    case 'circle':
    case 'square':
    case 'polygon':
    case 'polyline':
    case 'line':
    case 'ink':
    case 'free-text':
    case 'caret':
      return {
        subtype: subtype as AnnotationPatch['subtype'],
        contents: newContents,
      } as AnnotationPatch;
    default:
      return null;
  }
}
