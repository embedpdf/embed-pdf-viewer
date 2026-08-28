import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
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
import type { InkList, LinePoints, PdfPoint, PdfRect } from '../geometry/primitives';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { AbortError } from '../promise/AbortError';
import {
  AnnotationCreateResultSchema,
  AnnotationDeleteResultSchema,
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
   * QuadPoints to use for the create() smoke test. Coordinates are in
   * PDF user space; pick a small rectangle that fits anywhere on the
   * fixture page so we don't flake on different page sizes.
   */
  createQuad?: HighlightDraft['quadPoints'];
  /**
   * `/Rect` to use for the shape (circle/square) create tests. PDF user
   * space; pick a small box that fits anywhere on the fixture page.
   */
  createShapeRect?: PdfRect;
  /**
   * `/Vertices` to use for the polygon/polyline create tests. PDF user
   * space; must fit inside `createShapeRect` (the rect the engine bakes
   * the appearance into). Defaults to a small triangle.
   */
  createVertices?: PdfPoint[];
  /**
   * `/L` endpoints to use for the line create test. PDF user space; must
   * fit inside `createShapeRect`. Defaults to the rect's diagonal.
   */
  createLinePoints?: LinePoints;
  /**
   * `/InkList` strokes to use for the ink create test. PDF user space; must
   * fit inside `createShapeRect`. Defaults to a single short stroke.
   */
  createInkList?: InkList;
}

export interface AnnotationMutationConformanceOptions extends Omit<ConformanceOptions, 'fixture'> {
  fixture: AnnotationMutationConformanceFixture;
  /**
   * `true` for engines that expose the raw RGBA appearance rasters
   * (`renderAppearances`). When set, the shape-create test additionally
   * asserts that creating a shape produces a baked `/AP` the appearance
   * reader can rasterize. The cloud engine ships encoded images instead
   * and leaves this `false`.
   */
  supportsAppearanceRasters?: boolean;
}

const DEFAULT_QUAD: HighlightDraft['quadPoints'] = [
  {
    p1: { x: 50, y: 100 },
    p2: { x: 150, y: 100 },
    p3: { x: 50, y: 80 },
    p4: { x: 150, y: 80 },
  },
];

const DEFAULT_SHAPE_RECT: PdfRect = { left: 60, bottom: 60, right: 160, top: 140 };

/** A small triangle inside DEFAULT_SHAPE_RECT (valid for polygon: >=3). */
const DEFAULT_VERTICES: PdfPoint[] = [
  { x: 70, y: 70 },
  { x: 150, y: 70 },
  { x: 110, y: 130 },
];

/** A line along the diagonal of DEFAULT_SHAPE_RECT. */
const DEFAULT_LINE_POINTS: LinePoints = {
  start: { x: 70, y: 70 },
  end: { x: 150, y: 130 },
};

/**
 * A knee-jointed callout leader inside DEFAULT_SHAPE_RECT: the called-out
 * point, a knee, then the point touching the text box.
 */
const DEFAULT_CALLOUT_LINE: [PdfPoint, PdfPoint, PdfPoint] = [
  { x: 65, y: 65 },
  { x: 90, y: 90 },
  { x: 110, y: 100 },
];

/** A single freehand stroke inside DEFAULT_SHAPE_RECT (valid for ink). */
const DEFAULT_INK_STROKES: InkList = [
  [
    { x: 70, y: 70 },
    { x: 100, y: 120 },
    { x: 130, y: 80 },
    { x: 150, y: 130 },
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
 *     as non-invalidating — revisions do NOT bump and weak refs
 *     captured before the create remain valid.
 *   - `update` is non-structural; revisions do NOT bump.
 *   - Opportunistic /NM stamp upgrades a weak annotation's ref to
 *     `kind: 'nm'` on update; an already-durable annotation's /NM is
 *     NEVER touched.
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
        const page = doc.page(fix.pageObjectNumber);
        const before = await page.annotations.list();
        const beforeCount = before.annotations.length;

        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'mutation conformance: created',
          color: { r: 200, g: 100, b: 50 },
          opacity: 0.5,
          quadPoints: quad,
        };
        const result = await page.annotations.create(draft);
        expect(AnnotationCreateResultSchema.safeParse(result).success).toBe(true);
        expect(result.meta.affectedPages.length).toBe(1);
        expect(result.meta.affectedPages[0].pageObjectNumber).toBe(fix.pageObjectNumber);
        expect('cacheDelta' in result.meta).toBe(true);

        // Always durable (engine uses the EPDFPage_CreateAnnot fork helper).
        expect(result.created.identityQuality).toBe('durable');
        expect(result.created.subtype).toBe('highlight');
        expect(result.created.ref.kind).toBe('objectNumber');

        // Locked rule: create is append-only, so the page revision does
        // NOT bump and no weak refs become stale — regardless of whether
        // the page had pre-existing weak annotations.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pageState.revision.generation,
        );
        expect(result.meta.shouldRefetch).toBe(null);
        expect(result.meta.weakRefsInvalidated).toBe(false);
        expect(result.meta.changed.length).toBe(1);

        // The annotation is actually on the page now, at the END of the
        // /Annots array. This is the invariant that justifies the
        // non-invalidating impact: every prior index is preserved.
        const after = await page.annotations.list();
        expect(after.annotations.length).toBe(beforeCount + 1);
        expect(result.created.index).toBe(beforeCount);
      } finally {
        await doc.close();
      }
    });

    test('create + update honor annotation flags (set on create, merge on patch)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);

        // Create with a single flag set; the others must default to false.
        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'mutation conformance: flags',
          color: { r: 10, g: 20, b: 30 },
          opacity: 1,
          quadPoints: quad,
          flags: { print: true },
        };
        const created = await page.annotations.create(draft);
        expect(created.created.flags.print).toBe(true);
        expect(created.created.flags.hidden).toBe(false);

        // Patch a different flag: it must merge, leaving `print` intact.
        const hidden = await page.annotations.update(created.created.ref, {
          subtype: 'highlight',
          flags: { hidden: true },
        });
        expect(hidden.updated.flags.hidden).toBe(true);
        expect(hidden.updated.flags.print).toBe(true);

        // Clearing one flag leaves the rest untouched.
        const cleared = await page.annotations.update(created.created.ref, {
          subtype: 'highlight',
          flags: { print: false },
        });
        expect(cleared.updated.flags.print).toBe(false);
        expect(cleared.updated.flags.hidden).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('create shape annotations (circle + square) round-trip shape fields', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);

        const circleDraft: CircleDraft = {
          subtype: 'circle',
          contents: 'mutation conformance: circle',
          rect: shapeRect,
          interiorColor: { r: 255, g: 0, b: 0 },
          color: { r: 0, g: 0, b: 255 },
          strokeWidth: 3,
          borderStyle: 'solid',
          opacity: 0.6,
        };
        const circle = await page.annotations.create(circleDraft);
        expect(AnnotationCreateResultSchema.safeParse(circle).success).toBe(true);
        expect(circle.created.subtype).toBe('circle');
        expect(circle.created.identityQuality).toBe('durable');
        expect(circle.created.ref.kind).toBe('objectNumber');
        if (circle.created.subtype === 'circle') {
          expect(circle.created.interiorColor).toMatchObject({ r: 255, g: 0, b: 0 });
          expect(circle.created.color).toMatchObject({ r: 0, g: 0, b: 255 });
          expect(circle.created.strokeWidth).toBe(3);
          expect(circle.created.borderStyle).toBe('solid');
          // /CA stored as f32 — compare at 2dp to absorb float drift.
          expect(Math.round(circle.created.opacity * 100) / 100).toBe(0.6);
          // /Rect round-trips. The chosen bounds are small integers that
          // are exactly representable in f32, so an exact compare is safe.
          expect(circle.created.rect.left).toBe(shapeRect.left);
          expect(circle.created.rect.right).toBe(shapeRect.right);
          expect(circle.created.rect.bottom).toBe(shapeRect.bottom);
          expect(circle.created.rect.top).toBe(shapeRect.top);
        }

        const squareDraft: SquareDraft = {
          subtype: 'square',
          contents: 'mutation conformance: square',
          rect: shapeRect,
          interiorColor: null,
          color: { r: 0, g: 128, b: 0 },
          strokeWidth: 2,
          borderStyle: 'dashed',
          dashArray: [3, 2],
          opacity: 1,
        };
        const square = await page.annotations.create(squareDraft);
        expect(AnnotationCreateResultSchema.safeParse(square).success).toBe(true);
        expect(square.created.subtype).toBe('square');
        if (square.created.subtype === 'square') {
          // interiorColor omitted/null => no fill.
          expect(square.created.interiorColor).toBe(null);
          expect(square.created.color).toMatchObject({ r: 0, g: 128, b: 0 });
          expect(square.created.borderStyle).toBe('dashed');
          expect(square.created.dashArray).toEqual([3, 2]);
        }

        const after = await page.annotations.list();
        const subtypes = after.annotations.map((a) => a.subtype);
        expect(subtypes.includes('circle')).toBe(true);
        expect(subtypes.includes('square')).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('cloudy border (/BE) + rect differences (/RD) are tri-state', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);

        // A plain shape reads BOTH optional entries as explicit null — absence
        // is stated, so a read DTO compares structurally against a clearing
        // patch. The draft ALSO states them as null (exactly what the plugin's
        // total projection emits for a fresh solid shape): a draft writer must
        // skip null, never dereference it — the stale-worker regression where
        // solid creates vanished while cloudy ones survived.
        const plainDraft: SquareDraft = {
          subtype: 'square',
          contents: 'mutation conformance: cloudy tri-state',
          rect: shapeRect,
          color: { r: 0, g: 128, b: 0 },
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
          cloudyIntensity: null,
          rectDifferences: null,
        };
        const plain = await page.annotations.create(plainDraft);
        expect(plain.created.subtype).toBe('square');
        if (plain.created.subtype === 'square') {
          expect(plain.created.cloudyIntensity).toBe(null);
          expect(plain.created.rectDifferences).toBe(null);
        }

        // A value sets /BE + /RD…
        const rd = { left: 5, top: 5, right: 5, bottom: 5 };
        const cloudy = await page.annotations.update(plain.created.ref, {
          subtype: 'square',
          cloudyIntensity: 2,
          rectDifferences: rd,
        });
        expect(cloudy.updated.subtype).toBe('square');
        if (cloudy.updated.subtype === 'square') {
          expect(cloudy.updated.cloudyIntensity).toBe(2);
          expect(cloudy.updated.rectDifferences).toMatchObject(rd);
        }

        // …and null removes them: the cloudy -> solid transition leaves no
        // stale /RD behind (the Adobe "phantom padding" regression).
        const solid = await page.annotations.update(plain.created.ref, {
          subtype: 'square',
          cloudyIntensity: null,
          rectDifferences: null,
        });
        expect(solid.updated.subtype).toBe('square');
        if (solid.updated.subtype === 'square') {
          expect(solid.updated.cloudyIntensity).toBe(null);
          expect(solid.updated.rectDifferences).toBe(null);
        }

        // Polygon carries /BE too (but never /RD, per ISO 32000) — same tri-state,
        // including the draft path.
        const polyDraft: PolygonDraft = {
          subtype: 'polygon',
          contents: 'mutation conformance: polygon cloudy tri-state',
          rect: shapeRect,
          vertices,
          color: { r: 0, g: 0, b: 255 },
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
          cloudyIntensity: 1,
        };
        const poly = await page.annotations.create(polyDraft);
        expect(poly.created.subtype).toBe('polygon');
        if (poly.created.subtype === 'polygon') {
          expect(poly.created.cloudyIntensity).toBe(1);
        }
        const polySolid = await page.annotations.update(poly.created.ref, {
          subtype: 'polygon',
          cloudyIntensity: null,
        });
        expect(polySolid.updated.subtype).toBe('polygon');
        if (polySolid.updated.subtype === 'polygon') {
          expect(polySolid.updated.cloudyIntensity).toBe(null);
        }
      } finally {
        await doc.close();
      }
    });

    test('update echoes the appearance verdict: moves preserve /AP, restyles re-bake', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const draft: SquareDraft = {
          subtype: 'square',
          contents: 'mutation conformance: appearance echo',
          rect: shapeRect,
          color: { r: 200, g: 0, b: 0 },
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
        };
        const created = await page.annotations.create(draft);

        // A full-projection patch whose only real change is a same-size /Rect
        // move: the engine value-diffs away the unchanged style keys, verifies
        // the rigid translation, and preserves the baked /AP — the raster
        // invalidation signal stays off.
        const moved = await page.annotations.update(created.created.ref, {
          subtype: 'square',
          rect: {
            left: shapeRect.left + 12,
            bottom: shapeRect.bottom - 8,
            right: shapeRect.right + 12,
            top: shapeRect.top - 8,
          },
          color: { r: 200, g: 0, b: 0 },
          strokeWidth: 2,
          opacity: 1,
        });
        expect(moved.appearance).toEqual({ action: 'preserved', changed: false });

        // Metadata-only patches never touch /AP.
        const flagged = await page.annotations.update(created.created.ref, {
          subtype: 'square',
          flags: { print: true },
        });
        expect(flagged.appearance).toEqual({ action: 'preserved', changed: false });

        // A real style edit re-bakes and says so.
        const restyled = await page.annotations.update(created.created.ref, {
          subtype: 'square',
          interiorColor: { r: 255, g: 214, b: 0 },
        });
        expect(restyled.appearance).toEqual({ action: 'regenerated', changed: true });

        // A resize is not a translation — it re-bakes too.
        const resized = await page.annotations.update(created.created.ref, {
          subtype: 'square',
          rect: {
            left: shapeRect.left,
            bottom: shapeRect.bottom,
            right: shapeRect.right + 40,
            top: shapeRect.top,
          },
        });
        expect(resized.appearance).toEqual({ action: 'regenerated', changed: true });
      } finally {
        await doc.close();
      }
    });

    test('a partial /DA patch preserves the unpatched font members', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const draft: FreeTextDraft = {
          subtype: 'free-text',
          intent: 'free-text',
          contents: 'DA read-modify-write',
          rect: shapeRect,
          fontFamily: 'times-roman',
          fontSize: 14,
          textAlign: 'left',
          color: { r: 200, g: 0, b: 0 },
        };
        const created = await page.annotations.create(draft);
        // `/DA` packs font+size+colour into one string; the writer must
        // read-modify-write, so a partial patch cannot reset the others (the
        // old constant fallbacks turned a size-only patch into 12pt black).
        expect(created.created.subtype).toBe('free-text');
        if (created.created.subtype === 'free-text') {
          expect(created.created.fontFamily).toBe('times-roman');
        }
        const sized = await page.annotations.update(created.created.ref, {
          subtype: 'free-text',
          fontSize: 18,
        });
        expect(sized.updated.subtype).toBe('free-text');
        if (sized.updated.subtype === 'free-text') {
          expect(sized.updated.fontFamily).toBe('times-roman');
          expect(sized.updated.fontSize).toBe(18);
          expect(sized.updated.color).toMatchObject({ r: 200, g: 0, b: 0 });
        }
        const recolored = await page.annotations.update(created.created.ref, {
          subtype: 'free-text',
          color: { r: 0, g: 0, b: 200 },
        });
        if (recolored.updated.subtype === 'free-text') {
          expect(recolored.updated.fontFamily).toBe('times-roman');
          expect(recolored.updated.fontSize).toBe(18);
          expect(recolored.updated.color).toMatchObject({ r: 0, g: 0, b: 200 });
        }
      } finally {
        await doc.close();
      }
    });

    test('box transform is tri-state: rect-only moves keep rotation, null flattens', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const draft: SquareDraft = {
          subtype: 'square',
          contents: 'transform tri-state',
          rect: shapeRect,
          color: { r: 0, g: 0, b: 255 },
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
          // A 90° rotation whose AABB equals the box (square) — valid pair.
          rotation: 90,
          unrotatedRect: shapeRect,
        };
        const created = await page.annotations.create(draft);
        expect(created.created.subtype).toBe('square');
        if (created.created.subtype === 'square') {
          expect(created.created.rotation).toBe(90);
        }

        // The whole group riding one delta is a verified translation: the
        // rotation survives AND the baked /AP is preserved.
        const d = { x: 15, y: -10 };
        const shift = (r: typeof shapeRect) => ({
          left: r.left + d.x,
          bottom: r.bottom + d.y,
          right: r.right + d.x,
          top: r.top + d.y,
        });
        const trioMoved = await page.annotations.update(created.created.ref, {
          subtype: 'square',
          rect: shift(shapeRect),
          rotation: 90,
          unrotatedRect: shift(shapeRect),
        });
        expect(trioMoved.appearance).toEqual({ action: 'preserved', changed: false });
        if (trioMoved.updated.subtype === 'square') {
          expect(trioMoved.updated.rotation).toBe(90);
        }

        // A rect-only move PRESERVES the omitted rotation (tri-state law: a
        // patch touches what it states) — the old writer cleared it.
        const rectOnly = await page.annotations.update(created.created.ref, {
          subtype: 'square',
          rect: shapeRect,
        });
        if (rectOnly.updated.subtype === 'square') {
          expect(rectOnly.updated.rotation).toBe(90);
        }

        // Explicit null flattens — the ONLY way to remove the rotation.
        const flattened = await page.annotations.update(created.created.ref, {
          subtype: 'square',
          rotation: null,
          unrotatedRect: null,
        });
        if (flattened.updated.subtype === 'square') {
          expect(flattened.updated.rotation).toBe(undefined);
          expect(flattened.updated.unrotatedRect).toBe(undefined);
        }
      } finally {
        await doc.close();
      }
    });

    test('create vertex + line annotations (polygon/polyline/line) round-trip geometry', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);

        const polygonDraft: PolygonDraft = {
          subtype: 'polygon',
          contents: 'mutation conformance: polygon',
          rect: shapeRect,
          vertices,
          interiorColor: { r: 255, g: 200, b: 0 },
          color: { r: 0, g: 0, b: 255 },
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 0.8,
        };
        const polygon = await page.annotations.create(polygonDraft);
        expect(AnnotationCreateResultSchema.safeParse(polygon).success).toBe(true);
        expect(polygon.created.subtype).toBe('polygon');
        if (polygon.created.subtype === 'polygon') {
          expect(polygon.created.vertices.length).toBe(vertices.length);
          expect(polygon.created.color).toMatchObject({ r: 0, g: 0, b: 255 });
          expect(polygon.created.interiorColor).toMatchObject({ r: 255, g: 200, b: 0 });
        }

        const polylineDraft: PolylineDraft = {
          subtype: 'polyline',
          contents: 'mutation conformance: polyline',
          rect: shapeRect,
          vertices,
          interiorColor: null,
          color: { r: 200, g: 0, b: 0 },
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
          lineEndings: { start: 'open-arrow', end: 'closed-arrow' },
        };
        const polyline = await page.annotations.create(polylineDraft);
        expect(AnnotationCreateResultSchema.safeParse(polyline).success).toBe(true);
        expect(polyline.created.subtype).toBe('polyline');
        if (polyline.created.subtype === 'polyline') {
          expect(polyline.created.vertices.length).toBe(vertices.length);
          expect(polyline.created.lineEndings.start).toBe('open-arrow');
          expect(polyline.created.lineEndings.end).toBe('closed-arrow');
        }

        const lineDraft: LineDraft = {
          subtype: 'line',
          contents: 'mutation conformance: line',
          rect: shapeRect,
          linePoints,
          interiorColor: null,
          color: { r: 0, g: 128, b: 128 },
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
          lineEndings: { start: 'none', end: 'open-arrow' },
        };
        const line = await page.annotations.create(lineDraft);
        expect(AnnotationCreateResultSchema.safeParse(line).success).toBe(true);
        expect(line.created.subtype).toBe('line');
        if (line.created.subtype === 'line') {
          // /L stored as f32 — compare rounded to absorb float drift.
          expect(Math.round(line.created.linePoints.start.x)).toBe(Math.round(linePoints.start.x));
          expect(Math.round(line.created.linePoints.end.y)).toBe(Math.round(linePoints.end.y));
          expect(line.created.lineEndings.end).toBe('open-arrow');
        }

        const inkDraft: InkDraft = {
          subtype: 'ink',
          contents: 'mutation conformance: ink',
          rect: shapeRect,
          inkList: inkStrokes,
          color: { r: 29, g: 78, b: 216 },
          strokeWidth: 3,
          borderStyle: 'solid',
          opacity: 1,
        };
        const ink = await page.annotations.create(inkDraft);
        expect(AnnotationCreateResultSchema.safeParse(ink).success).toBe(true);
        expect(ink.created.subtype).toBe('ink');
        if (ink.created.subtype === 'ink') {
          expect(ink.created.inkList.length).toBe(inkStrokes.length);
          expect(ink.created.inkList[0]!.length).toBe(inkStrokes[0]!.length);
          expect(ink.created.color).toMatchObject({ r: 29, g: 78, b: 216 });
          expect(ink.created.intent).toBe(null);
          expect(ink.created.blendMode).toBe('normal');
          // Ink has a stroke but no /IC.
          expect('interiorColor' in ink.created).toBe(false);
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
        const page = doc.page(fix.pageObjectNumber);

        // Plain free text, no fontColor override => text follows `color`.
        const freeTextDraft: FreeTextDraft = {
          subtype: 'free-text',
          intent: 'free-text',
          contents: 'mutation conformance: free text',
          rect: shapeRect,
          fontFamily: 'helvetica',
          fontSize: 14,
          textAlign: 'center',
          color: { r: 20, g: 40, b: 60 },
          interiorColor: { r: 250, g: 250, b: 210 },
          opacity: 1,
          strokeWidth: 1,
          borderStyle: 'solid',
        };
        const freeText = await page.annotations.create(freeTextDraft);
        expect(AnnotationCreateResultSchema.safeParse(freeText).success).toBe(true);
        expect(freeText.created.subtype).toBe('free-text');
        if (freeText.created.subtype === 'free-text') {
          expect(freeText.created.intent).toBe('free-text');
          expect(freeText.created.fontFamily).toBe('helvetica');
          expect(freeText.created.fontSize).toBe(14);
          expect(freeText.created.textAlign).toBe('center');
          expect(freeText.created.color).toMatchObject({ r: 20, g: 40, b: 60 });
          expect(freeText.created.interiorColor).toMatchObject({ r: 250, g: 250, b: 210 });
          // No override sent => text follows `color`, so fontColor is omitted.
          expect(freeText.created.fontColor === undefined).toBe(true);
        }

        // Callout: intent + /CL leader + /LE ending, explicit fontColor
        // override, transparent (null) background.
        const calloutDraft: FreeTextDraft = {
          subtype: 'free-text',
          intent: 'free-text-callout',
          contents: 'mutation conformance: callout',
          rect: shapeRect,
          fontFamily: 'times-roman',
          fontSize: 12,
          textAlign: 'left',
          color: { r: 0, g: 0, b: 0 },
          fontColor: { r: 200, g: 0, b: 0 },
          interiorColor: null,
          opacity: 1,
          strokeWidth: 1,
          borderStyle: 'solid',
          calloutLine: DEFAULT_CALLOUT_LINE,
          lineEnding: 'open-arrow',
        };
        const callout = await page.annotations.create(calloutDraft);
        expect(AnnotationCreateResultSchema.safeParse(callout).success).toBe(true);
        expect(callout.created.subtype).toBe('free-text');
        if (callout.created.subtype === 'free-text') {
          expect(callout.created.intent).toBe('free-text-callout');
          expect(callout.created.interiorColor).toBe(null);
          // fontColor differs from color => surfaced as an override.
          expect(callout.created.fontColor).toMatchObject({ r: 200, g: 0, b: 0 });
          expect(callout.created.color).toMatchObject({ r: 0, g: 0, b: 0 });
          expect(callout.created.calloutLine?.length).toBe(DEFAULT_CALLOUT_LINE.length);
          expect(callout.created.lineEnding).toBe('open-arrow');
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
        const page = doc.page(fix.pageObjectNumber);
        const created = await page.annotations.create({
          subtype: 'free-text',
          intent: 'free-text',
          contents: 'free-text-update-base',
          rect: shapeRect,
          fontFamily: 'helvetica',
          fontSize: 12,
          textAlign: 'left',
          color: { r: 0, g: 0, b: 0 },
          interiorColor: null,
          opacity: 1,
          strokeWidth: 1,
          borderStyle: 'solid',
        } satisfies FreeTextDraft);
        const before = await page.annotations.list();

        const result = await page.annotations.update(created.created.ref, {
          subtype: 'free-text',
          textAlign: 'right',
          fontFamily: 'helvetica',
          fontSize: 18,
          color: { r: 0, g: 80, b: 160 },
          interiorColor: { r: 240, g: 240, b: 240 },
        });
        expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
        expect(result.updated.subtype).toBe('free-text');
        if (result.updated.subtype === 'free-text') {
          expect(result.updated.textAlign).toBe('right');
          expect(result.updated.fontSize).toBe(18);
          expect(result.updated.color).toMatchObject({ r: 0, g: 80, b: 160 });
          expect(result.updated.interiorColor).toMatchObject({ r: 240, g: 240, b: 240 });
        }
        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pageState.revision.generation,
        );
        expect(result.meta.weakRefsInvalidated).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('create redact (area + text) round-trips label + colour fields', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);

        // Area redaction (no quads: /Rect is the removal region) with a
        // fully-styled label.
        const areaDraft: RedactDraft = {
          subtype: 'redact',
          contents: 'mutation conformance: area redact',
          rect: shapeRect,
          color: { r: 228, g: 66, b: 52 },
          opacity: 1,
          interiorColor: { r: 0, g: 0, b: 0 },
          overlayText: 'CONFIDENTIAL',
          repeat: true,
          fontFamily: 'helvetica',
          fontSize: 10,
          fontColor: { r: 255, g: 255, b: 255 },
          textAlign: 'center',
        };
        const area = await page.annotations.create(areaDraft);
        expect(AnnotationCreateResultSchema.safeParse(area).success).toBe(true);
        expect(area.created.subtype).toBe('redact');
        if (area.created.subtype === 'redact') {
          expect(area.created.quadPoints.length).toBe(0);
          expect(area.created.color).toMatchObject({ r: 228, g: 66, b: 52 });
          expect(area.created.interiorColor).toMatchObject({ r: 0, g: 0, b: 0 });
          expect(area.created.overlayText).toBe('CONFIDENTIAL');
          expect(area.created.repeat).toBe(true);
          expect(area.created.fontFamily).toBe('helvetica');
          expect(area.created.fontSize).toBe(10);
          expect(area.created.fontColor).toMatchObject({ r: 255, g: 255, b: 255 });
          expect(area.created.textAlign).toBe('center');
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
        expect(text.created.subtype).toBe('redact');
        if (text.created.subtype === 'redact') {
          expect(text.created.quadPoints.length).toBe(quad.length);
          expect(text.created.interiorColor).toBe(null);
          expect(text.created.overlayText).toBe(null);
          expect(text.created.repeat).toBe(false);
          // Default marking outline is the red redaction convention.
          expect(text.created.color).toMatchObject({ r: 255, g: 0, b: 0 });
        }
      } finally {
        await doc.close();
      }
    });

    test('update a redact patches the label and clears it, non-structurally', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const created = await page.annotations.create({
          subtype: 'redact',
          contents: 'redact-update-base',
          rect: shapeRect,
          interiorColor: { r: 0, g: 0, b: 0 },
          overlayText: 'DRAFT',
          fontFamily: 'helvetica',
          fontSize: 8,
          fontColor: { r: 255, g: 255, b: 255 },
        } satisfies RedactDraft);
        const before = await page.annotations.list();

        // Restyle the label. fontSize 0 is meaningful for a redaction label
        // (auto-fit) and must round-trip verbatim, unlike free text.
        const restyled = await page.annotations.update(created.created.ref, {
          subtype: 'redact',
          overlayText: 'REDACTED',
          repeat: true,
          fontFamily: 'helvetica',
          fontSize: 0,
          fontColor: { r: 255, g: 240, b: 240 },
          textAlign: 'right',
          interiorColor: { r: 10, g: 10, b: 10 },
        });
        expect(AnnotationUpdateResultSchema.safeParse(restyled).success).toBe(true);
        expect(restyled.updated.subtype).toBe('redact');
        if (restyled.updated.subtype === 'redact') {
          expect(restyled.updated.overlayText).toBe('REDACTED');
          expect(restyled.updated.repeat).toBe(true);
          expect(restyled.updated.fontSize).toBe(0);
          expect(restyled.updated.fontColor).toMatchObject({ r: 255, g: 240, b: 240 });
          expect(restyled.updated.textAlign).toBe('right');
          expect(restyled.updated.interiorColor).toMatchObject({ r: 10, g: 10, b: 10 });
        }

        // Clear the label and the fill: null wipes /OverlayText and /IC.
        const cleared = await page.annotations.update(created.created.ref, {
          subtype: 'redact',
          overlayText: null,
          repeat: false,
          interiorColor: null,
        });
        expect(cleared.updated.subtype).toBe('redact');
        if (cleared.updated.subtype === 'redact') {
          expect(cleared.updated.overlayText).toBe(null);
          expect(cleared.updated.repeat).toBe(false);
          expect(cleared.updated.interiorColor).toBe(null);
        }

        // Updates never bump the revision.
        expect(cleared.meta.affectedPages[0].revision.generation).toBe(
          before.pageState.revision.generation,
        );
        expect(cleared.meta.weakRefsInvalidated).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('create + update a caret round-trips color/opacity/rect differences', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);

        const caretDraft: CaretDraft = {
          subtype: 'caret',
          intent: 'replace',
          contents: 'mutation conformance: caret',
          rect: shapeRect,
          color: { r: 0, g: 128, b: 255 },
          opacity: 0.7,
          rectDifferences: { left: 2, top: 2, right: 2, bottom: 2 },
        };
        const caret = await page.annotations.create(caretDraft);
        expect(AnnotationCreateResultSchema.safeParse(caret).success).toBe(true);
        expect(caret.created.subtype).toBe('caret');
        expect(caret.created.identityQuality).toBe('durable');
        expect(caret.created.ref.kind).toBe('objectNumber');
        if (caret.created.subtype === 'caret') {
          expect(caret.created.intent).toBe('replace');
          expect(caret.created.color).toMatchObject({ r: 0, g: 128, b: 255 });
          expect(Math.round(caret.created.opacity * 100) / 100).toBe(0.7);
          // Caret carries no border or quads.
          expect('strokeWidth' in caret.created).toBe(false);
          expect('quadPoints' in caret.created).toBe(false);
          expect(caret.created.rectDifferences).toMatchObject({
            left: 2,
            top: 2,
            right: 2,
            bottom: 2,
          });
        }

        const before = await page.annotations.list();
        const result = await page.annotations.update(caret.created.ref, {
          subtype: 'caret',
          color: { r: 255, g: 0, b: 0 },
          rectDifferences: { left: 4, top: 4, right: 4, bottom: 4 },
        });
        expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
        expect(result.updated.subtype).toBe('caret');
        if (result.updated.subtype === 'caret') {
          expect(result.updated.color).toMatchObject({ r: 255, g: 0, b: 0 });
        }
        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pageState.revision.generation,
        );
        expect(result.meta.weakRefsInvalidated).toBe(false);

        // Tri-state: `null` removes /RD entirely (a read then states the absence).
        const rdCleared = await page.annotations.update(caret.created.ref, {
          subtype: 'caret',
          rectDifferences: null,
        });
        expect(rdCleared.updated.subtype).toBe('caret');
        if (rdCleared.updated.subtype === 'caret') {
          expect(rdCleared.updated.rectDifferences).toBe(null);
        }

        const after = await page.annotations.list();
        expect(after.annotations.some((a) => a.subtype === 'caret')).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('update an ink annotation patches strokes + color and is non-structural', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const created = await page.annotations.create({
          subtype: 'ink',
          contents: 'ink-update-base',
          rect: shapeRect,
          inkList: inkStrokes,
          color: { r: 0, g: 0, b: 0 },
          strokeWidth: 2,
          borderStyle: 'solid',
          opacity: 1,
        } satisfies InkDraft);
        const before = await page.annotations.list();

        const newStrokes: InkList = [
          ...inkStrokes,
          [
            { x: 80, y: 90 },
            { x: 120, y: 110 },
          ],
        ];
        const result = await page.annotations.update(created.created.ref, {
          subtype: 'ink',
          inkList: newStrokes,
          color: { r: 220, g: 20, b: 60 },
        });
        expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
        expect(result.updated.subtype).toBe('ink');
        if (result.updated.subtype === 'ink') {
          expect(result.updated.inkList.length).toBe(newStrokes.length);
          expect(result.updated.color).toMatchObject({ r: 220, g: 20, b: 60 });
        }
        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pageState.revision.generation,
        );
        expect(result.meta.weakRefsInvalidated).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('ink highlight intent + blend round-trip and unrelated patches preserve blend', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const created = await page.annotations.create({
          subtype: 'ink',
          intent: 'ink-highlight',
          blendMode: 'multiply',
          rect: shapeRect,
          inkList: inkStrokes,
          color: { r: 255, g: 205, b: 69 },
          strokeWidth: 14,
          borderStyle: 'solid',
          opacity: 1,
        } satisfies InkDraft);
        expect(created.created.subtype).toBe('ink');
        if (created.created.subtype !== 'ink') return;
        expect(created.created.intent).toBe('ink-highlight');
        expect(created.created.blendMode).toBe('multiply');

        const recolored = await page.annotations.update(created.created.ref, {
          subtype: 'ink',
          color: { r: 250, g: 190, b: 40 },
        });
        expect(recolored.updated.subtype).toBe('ink');
        expect(recolored.updated.blendMode).toBe('multiply');

        const screened = await page.annotations.update(created.created.ref, {
          subtype: 'ink',
          blendMode: 'screen',
        });
        expect(screened.updated.subtype).toBe('ink');
        expect(screened.updated.blendMode).toBe('screen');
      } finally {
        await doc.close();
      }
    });

    test('update a polyline patches vertices + line endings and is non-structural', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const created = await page.annotations.create({
          subtype: 'polyline',
          contents: 'polyline-update-base',
          rect: shapeRect,
          vertices,
          interiorColor: null,
          color: { r: 0, g: 0, b: 0 },
          strokeWidth: 1,
          borderStyle: 'solid',
          opacity: 1,
          lineEndings: { start: 'none', end: 'none' },
        } satisfies PolylineDraft);
        const before = await page.annotations.list();

        const newVertices: PdfPoint[] = [
          ...vertices,
          { x: vertices[0]!.x + 5, y: vertices[0]!.y + 5 },
        ];
        const result = await page.annotations.update(created.created.ref, {
          subtype: 'polyline',
          vertices: newVertices,
          lineEndings: { start: 'circle', end: 'diamond' },
        });
        expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
        expect(result.updated.subtype).toBe('polyline');
        if (result.updated.subtype === 'polyline') {
          expect(result.updated.vertices.length).toBe(newVertices.length);
          expect(result.updated.lineEndings.start).toBe('circle');
          expect(result.updated.lineEndings.end).toBe('diamond');
        }
        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pageState.revision.generation,
        );
        expect(result.meta.weakRefsInvalidated).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('update a shape annotation patches color and is non-structural', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const created = await page.annotations.create({
          subtype: 'circle',
          contents: 'shape-update-base',
          rect: shapeRect,
          interiorColor: { r: 10, g: 20, b: 30 },
          color: { r: 0, g: 0, b: 0 },
          strokeWidth: 1,
          borderStyle: 'solid',
          opacity: 1,
        } satisfies CircleDraft);
        const before = await page.annotations.list();

        const result = await page.annotations.update(created.created.ref, {
          subtype: 'circle',
          interiorColor: { r: 200, g: 100, b: 50 },
          strokeWidth: 4,
        });
        expect(AnnotationUpdateResultSchema.safeParse(result).success).toBe(true);
        expect(result.updated.subtype).toBe('circle');
        if (result.updated.subtype === 'circle') {
          expect(result.updated.interiorColor).toMatchObject({ r: 200, g: 100, b: 50 });
          expect(result.updated.strokeWidth).toBe(4);
          // Unpatched fields are preserved.
          expect(result.updated.borderStyle).toBe('solid');
        }
        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pageState.revision.generation,
        );
        expect(result.meta.weakRefsInvalidated).toBe(false);
      } finally {
        await doc.close();
      }
    });

    if (opts.supportsAppearanceRasters) {
      test('creating a shape bakes an /AP appearance the reader can rasterize', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const page = doc.page(fix.pageObjectNumber);
          const created = await page.annotations.create({
            subtype: 'circle',
            contents: 'appearance-gen',
            rect: shapeRect,
            interiorColor: { r: 255, g: 0, b: 0 },
            color: { r: 0, g: 0, b: 0 },
            strokeWidth: 2,
            borderStyle: 'solid',
            opacity: 1,
          } satisfies CircleDraft);

          const appearances = await page.annotations.renderAppearances({ scale: 1 });
          const match = appearances.appearances.find(
            (a) =>
              a.ref.kind === 'objectNumber' &&
              created.created.ref.kind === 'objectNumber' &&
              a.ref.annotObjectNumber === created.created.ref.annotObjectNumber,
          );
          // The freshly created shape must carry a baked /AP (generated by
          // the mutator), so the appearance reader emits a non-empty raster.
          expect(match !== undefined).toBe(true);
          expect((match?.raster.width ?? 0) > 0).toBeTruthy();
          expect((match?.raster.height ?? 0) > 0).toBeTruthy();
        } finally {
          await doc.close();
        }
      });
    }

    test('update on a durable annotation is non-structural and never touches /NM', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
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
        expect(result.meta.affectedPages[0].pageObjectNumber).toBe(fix.pageObjectNumber);
        expect('cacheDelta' in result.meta).toBe(true);

        // Same identity, /NM untouched.
        expect(result.updated.ref.kind).toBe(target.ref.kind);
        expect(result.updated.nm).toBe(target.nm);

        // Update never bumps the revision.
        expect(result.meta.affectedPages[0].revision.generation).toBe(
          before.pageState.revision.generation,
        );
        expect(result.meta.shouldRefetch).toBe(null);
        expect(result.meta.weakRefsInvalidated).toBe(false);

        // Round-trip the new contents.
        expect(result.updated.contents).toBe(newContents);
      } finally {
        await doc.close();
      }
    });

    if (fix.expectsWeakAnnotation) {
      test('update on a weak annotation stamps a UUID v4 /NM and upgrades the ref', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const page = doc.page(fix.pageObjectNumber);
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
          expect(result.meta.affectedPages[0].pageObjectNumber).toBe(fix.pageObjectNumber);
          expect('cacheDelta' in result.meta).toBe(true);

          // The ref is upgraded to durable. Either nm (engine-stamped) or
          // objectNumber (if the annotation surprisingly had one) is fine.
          expect(
            result.updated.ref.kind === 'nm' || result.updated.ref.kind === 'objectNumber',
          ).toBe(true);
          expect(result.updated.identityQuality).toBe('durable');
          if (result.updated.ref.kind === 'nm') {
            expect(result.updated.nm !== null).toBe(true);
            expect(typeof result.updated.nm).toBe('string');
            // Engine stamps RFC 4122 v4 UUIDs: 8-4-4-4-12 hex with
            // version 4 and variant 10xx. Match loosely.
            expect(
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
                result.updated.nm!,
              ),
            ).toBe(true);
          }

          // Still non-structural.
          expect(result.meta.affectedPages[0].revision.generation).toBe(
            before.pageState.revision.generation,
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
        const page = doc.page(fix.pageObjectNumber);
        // Create one we own so we don't disturb the fixture's other tests.
        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'mutation conformance: to-delete',
          quadPoints: quad,
        };
        const created = await page.annotations.create(draft);
        const before = await page.annotations.list();

        const weakSession = await beginWeakEditIfRequired(doc, fix.pageObjectNumber, fix);
        const result = await page.annotations.delete(created.created.ref);
        try {
          expect(AnnotationDeleteResultSchema.safeParse(result).success).toBe(true);
          expect(result.meta.affectedPages.length).toBe(1);
          expect(result.meta.affectedPages[0].pageObjectNumber).toBe(fix.pageObjectNumber);
          expect('cacheDelta' in result.meta).toBe(true);

          // Stable id is reported (we created it; it's durable).
          expect(result.deleted !== null).toBe(true);
          expect(result.deleted?.kind).toBe('objectNumber');

          // Structural: revision bumped.
          expect(result.meta.affectedPages[0].revision.generation).toBe(
            before.pageState.revision.generation + 1,
          );

          // The annotation is gone.
          const after = await page.annotations.list();
          expect(after.annotations.length).toBe(before.annotations.length - 1);
        } finally {
          await weakSession?.release();
        }
      } finally {
        await doc.close();
      }
    });

    if (fix.expectsWeakAnnotation) {
      test('delete by index of a weak annotation reports deleted: null and refetch reason', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const page = doc.page(fix.pageObjectNumber);
          const before = await page.annotations.list();
          const weak = before.annotations.find((a) => a.identityQuality === 'weak');
          if (!weak) return;
          expect(weak.ref.kind).toBe('index');

          const weakSession = await beginWeakEditIfRequired(doc, fix.pageObjectNumber, fix);
          const result = await page.annotations.delete(weak.ref);
          try {
            // The weak annotation MAY have had /NM in some shapes (very
            // legacy PDFs), but the locked semantics say a true weak
            // delete returns null. We assert "either null or a stable id"
            // since the fixture controls which side this lands on.
            expect(
              result.deleted === null ||
                result.deleted.kind === 'objectNumber' ||
                result.deleted.kind === 'nm',
            ).toBe(true);
            expect(result.meta.affectedPages.length).toBe(1);
            expect(result.meta.affectedPages[0].pageObjectNumber).toBe(fix.pageObjectNumber);
            expect('cacheDelta' in result.meta).toBe(true);

            // The page had weak refs before, structural mutation,
            // therefore: shouldRefetch is set.
            expect(result.meta.shouldRefetch?.reason).toBe('weakRefsInvalidated');
            expect(result.meta.weakRefsInvalidated).toBe(true);
          } finally {
            await weakSession?.release();
          }
        } finally {
          await doc.close();
        }
      });
    }

    test('abort on create rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
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
        const page = doc.page(fix.pageObjectNumber);
        const before = await page.annotations.list();
        const weak = before.annotations.find((a) => a.identityQuality === 'weak');
        if (!weak || weak.ref.kind !== 'index') return;

        // Force the revision out of date by minting an *index-shifting*
        // mutation, then trying to update against the stale ref. We
        // deliberately use a throwaway create+delete pair (delete is
        // the rev-bumping op now — create is append-only and does NOT
        // bump revisions, so it can't be used here).
        const throwaway = await page.annotations.create({
          subtype: 'highlight',
          contents: 'rev-bump-throwaway',
          quadPoints: quad,
        });
        const weakSession = await beginWeakEditIfRequired(doc, fix.pageObjectNumber, fix);
        await page.annotations.delete(throwaway.created.ref);
        await weakSession?.release();

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
    //  - Weak refs in the batch are upgraded to durable /NM BEFORE the
    //    move; the moved DTOs come out durable and `meta.changed` lists
    //    stable ids.
    //  - Stale revision, out-of-range, duplicate, and abort all reject.
    // ─────────────────────────────────────────────────────────────────

    test('move single durable annotation reorders within the page (single-as-batch)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);

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
        const beforeRev = list.pageState.revision.generation;

        // Find current indices of a and b.
        const aIdx = list.annotations.findIndex(
          (x) =>
            x.ref.kind === 'objectNumber' &&
            a.created.ref.kind === 'objectNumber' &&
            x.ref.annotObjectNumber === a.created.ref.annotObjectNumber,
        );
        const bIdx = list.annotations.findIndex(
          (x) =>
            x.ref.kind === 'objectNumber' &&
            b.created.ref.kind === 'objectNumber' &&
            x.ref.annotObjectNumber === b.created.ref.annotObjectNumber,
        );
        expect(aIdx >= 0 && bIdx >= 0).toBe(true);
        expect(aIdx < bIdx).toBe(true);

        // Move A to B's slot. Post-removal index space: A was removed,
        // so B's position becomes bIdx - 1. Targeting bIdx puts A AFTER
        // B's original position. Use `bIdx` as toIndex => A lands right
        // after B in the new order.
        const weakSession = await beginWeakEditIfRequired(doc, fix.pageObjectNumber, fix);
        const result = await page.annotations.move([a.created.ref], bIdx);
        try {
          expect(AnnotationMoveResultSchema.safeParse(result).success).toBe(true);
          expect(result.meta.affectedPages.length).toBe(1);
          expect(result.meta.affectedPages[0].pageObjectNumber).toBe(fix.pageObjectNumber);
          expect('cacheDelta' in result.meta).toBe(true);
          expect(result.moved.length).toBe(1);

          // Single revision bump per batch.
          expect(result.meta.affectedPages[0].revision.generation).toBe(beforeRev + 1);

          // The moved DTO sits at toIndex.
          if (result.moved[0].ref.kind === 'objectNumber') {
            const movedObjNum = result.moved[0].ref.annotObjectNumber;
            if (a.created.ref.kind === 'objectNumber') {
              expect(movedObjNum).toBe(a.created.ref.annotObjectNumber);
            }
          }

          // Verify the page now has A at its new position.
          const after = await page.annotations.list();
          expect(after.annotations.length).toBe(list.annotations.length);
        } finally {
          await weakSession?.release();
        }
      } finally {
        await doc.close();
      }
    });

    test('move multi-block preserves caller-supplied order at the destination', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);

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
        const beforeRev = list.pageState.revision.generation;

        // Move the three to position 0 in caller order [3, 1, 2].
        const callerOrder = [ids[2].created.ref, ids[0].created.ref, ids[1].created.ref];
        const weakSession = await beginWeakEditIfRequired(doc, fix.pageObjectNumber, fix);
        const result = await page.annotations.move(callerOrder, 0);
        try {
          // One revision bump even though three annotations moved.
          expect(result.meta.affectedPages[0].revision.generation).toBe(beforeRev + 1);
          expect(result.moved.length).toBe(3);
          expect(result.meta.changed.length).toBe(3);

          // Caller-supplied order preserved at the destination. Indices
          // 0, 1, 2 of the page now hold the moved DTOs in that order.
          const expectedOrder = [ids[2].created.ref, ids[0].created.ref, ids[1].created.ref].map(
            (r) => (r.kind === 'objectNumber' ? r.annotObjectNumber : null),
          );

          const movedObjNums = result.moved.map((d) =>
            d.ref.kind === 'objectNumber' ? d.ref.annotObjectNumber : null,
          );
          for (let i = 0; i < expectedOrder.length; i++) {
            expect(movedObjNums[i]).toBe(expectedOrder[i]);
          }
        } finally {
          await weakSession?.release();
        }
      } finally {
        await doc.close();
      }
    });

    if (fix.expectsWeakAnnotation) {
      test('move on a weak annotation upgrades it to durable /NM (one rev bump for batch)', async () => {
        const doc = await openFixture(engine, opts);
        try {
          const page = doc.page(fix.pageObjectNumber);
          const before = await page.annotations.list();
          const weak = before.annotations.find((a) => a.identityQuality === 'weak');
          if (!weak || weak.ref.kind !== 'index') return;
          const beforeRev = before.pageState.revision.generation;

          // Move the weak annotation to position 0 (or somewhere
          // non-trivial). The engine must stamp a fresh /NM BEFORE the
          // move so the result is durable.
          const target = weak.ref.index === 0 ? 1 : 0;
          const weakSession = await beginWeakEditIfRequired(doc, fix.pageObjectNumber, fix);
          const result = await page.annotations.move([weak.ref], target);
          try {
            expect(result.meta.affectedPages[0].revision.generation).toBe(beforeRev + 1);
            expect(result.moved.length).toBe(1);
            expect(result.moved[0].identityQuality).toBe('durable');
            expect(
              result.moved[0].ref.kind === 'nm' || result.moved[0].ref.kind === 'objectNumber',
            ).toBe(true);

            // meta.changed is a stable id, never a weak ref.
            expect(result.meta.changed.length).toBe(1);
            expect(
              result.meta.changed[0].kind === 'nm' ||
                result.meta.changed[0].kind === 'objectNumber',
            ).toBe(true);
          } finally {
            await weakSession?.release();
          }
        } finally {
          await doc.close();
        }
      });
    }

    test('move with a stale index revision rejects (locked rev-token guard)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const a = await page.annotations.create({
          subtype: 'highlight',
          contents: 'stale-a',
          quadPoints: quad,
        });
        const list = await page.annotations.list();
        const aIdx = list.annotations.findIndex(
          (x) =>
            x.ref.kind === 'objectNumber' &&
            a.created.ref.kind === 'objectNumber' &&
            x.ref.annotObjectNumber === a.created.ref.annotObjectNumber,
        );
        if (aIdx < 0) return;

        const staleIndexRef: AnnotationRef = {
          kind: 'index',
          pageObjectNumber: fix.pageObjectNumber,
          index: aIdx,
          revision: list.pageState.revision,
        };

        // Bump the revision by an unrelated index-shifting mutation.
        // create is append-only and no longer bumps revisions, so we
        // use a throwaway create+delete pair (the delete does the bump).
        const throwaway = await page.annotations.create({
          subtype: 'highlight',
          contents: 'bump-throwaway',
          quadPoints: quad,
        });
        const weakSession = await beginWeakEditIfRequired(doc, fix.pageObjectNumber, fix);
        await page.annotations.delete(throwaway.created.ref);

        let caught: unknown;
        try {
          await page.annotations.move([staleIndexRef], 0);
        } catch (err) {
          caught = err;
        } finally {
          await weakSession?.release();
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidReference)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('move with out-of-range toIndex rejects with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const a = await page.annotations.create({
          subtype: 'highlight',
          contents: 'oor-a',
          quadPoints: quad,
        });
        const list = await page.annotations.list();
        const farTooBig = list.annotations.length + 100;
        const weakSession = await beginWeakEditIfRequired(doc, fix.pageObjectNumber, fix);
        let caught: unknown;
        try {
          await page.annotations.move([a.created.ref], farTooBig);
        } catch (err) {
          caught = err;
        } finally {
          await weakSession?.release();
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('move with duplicate refs rejects with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const a = await page.annotations.create({
          subtype: 'highlight',
          contents: 'dup-a',
          quadPoints: quad,
        });
        const weakSession = await beginWeakEditIfRequired(doc, fix.pageObjectNumber, fix);
        let caught: unknown;
        try {
          await page.annotations.move([a.created.ref, a.created.ref], 0);
        } catch (err) {
          caught = err;
        } finally {
          await weakSession?.release();
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('abort on move rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const a = await page.annotations.create({
          subtype: 'highlight',
          contents: 'abort-a',
          quadPoints: quad,
        });
        const weakSession = await beginWeakEditIfRequired(doc, fix.pageObjectNumber, fix);
        const p = page.annotations.move([a.created.ref], 0);
        p.abort('test');
        try {
          await expect(p).rejects.toBeInstanceOf(AbortError);
        } finally {
          await weakSession?.release();
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
        const page = doc.page(fix.pageObjectNumber);
        const beforeGen = (await page.annotations.list()).pageState.revision.generation;

        // Pull some page to the front (prefer one that is NOT the host so
        // we exercise the cross-page case; fall back to the host itself for
        // single-page fixtures).
        const mover =
          list.pages.find((pg) => pg.pageObjectNumber !== fix.pageObjectNumber)?.pageObjectNumber ??
          fix.pageObjectNumber;
        await doc.pages.move([mover], 0);

        const afterGen = (await page.annotations.list()).pageState.revision.generation;
        expect(afterGen).toBe(beforeGen);
      } finally {
        await doc.close();
      }
    });

    // ─────────────────────────────────────────────────────────────────
    //  /IRT + /RT relationships (reply vs group). Locked rules:
    //  - A draft `inReplyTo` writes /IRT; /RT defaults to 'reply' when
    //    `replyType` is omitted (ISO 32000 §12.5.6.2 default).
    //  - The DTO surfaces `inReplyTo` (parent ref) + `replyType`; a
    //    top-level annotation reports both as null.
    //  - Linking reports the (possibly strengthened) parent id in
    //    `meta.changed` and is non-structural (no rev bump / refetch).
    //  - A cross-page parent is rejected with InvalidArg.
    // ─────────────────────────────────────────────────────────────────

    test('create a reply links /IRT and defaults /RT to "reply", reporting the parent', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const parent = await page.annotations.create({
          subtype: 'highlight',
          contents: 'reply parent',
          quadPoints: quad,
        } satisfies HighlightDraft);
        // A freshly created top-level annotation has no relationship.
        expect(parent.created.inReplyTo).toBe(null);
        expect(parent.created.replyType).toBe(null);

        const reply = await page.annotations.create({
          subtype: 'highlight',
          contents: 'a reply',
          quadPoints: quad,
          inReplyTo: parent.created.ref,
        } satisfies HighlightDraft);
        expect(AnnotationCreateResultSchema.safeParse(reply).success).toBe(true);
        // /RT absent in the draft normalizes to 'reply'.
        expect(reply.created.replyType).toBe('reply');
        expect(reply.created.inReplyTo === null).toBe(false);
        if (
          reply.created.inReplyTo?.kind === 'objectNumber' &&
          parent.created.ref.kind === 'objectNumber'
        ) {
          expect(reply.created.inReplyTo.annotObjectNumber).toBe(
            parent.created.ref.annotObjectNumber,
          );
          expect(reply.created.inReplyTo.pageObjectNumber).toBe(fix.pageObjectNumber);
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
            reply.created.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === reply.created.ref.annotObjectNumber,
        );
        expect(readReply?.replyType).toBe('reply');
        expect(readReply?.inReplyTo == null).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('create a grouped subordinate writes /RT /Group', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const primary = await page.annotations.create({
          subtype: 'highlight',
          contents: 'group primary',
          quadPoints: quad,
        } satisfies HighlightDraft);

        const caret = await page.annotations.create({
          subtype: 'caret',
          contents: '',
          rect: shapeRect,
          color: { r: 0, g: 0, b: 0 },
          opacity: 1,
          inReplyTo: primary.created.ref,
          replyType: 'group',
        } satisfies CaretDraft);
        expect(AnnotationCreateResultSchema.safeParse(caret).success).toBe(true);
        expect(caret.created.replyType).toBe('group');
        expect(caret.created.inReplyTo === null).toBe(false);

        const after = await page.annotations.list();
        const readCaret = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            caret.created.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === caret.created.ref.annotObjectNumber,
        );
        expect(readCaret?.replyType).toBe('group');
      } finally {
        await doc.close();
      }
    });

    // ─────────────────────────────────────────────────────────────────
    //  Link annotations. Locked rules:
    //  - `/Dest` and `/A GoTo` both read as the normalized `goto` arm;
    //    destinations carry page OBJECT NUMBERS on the wire (never
    //    indices) and raw PDF user-space coordinates.
    //  - `target: null` creates a dead link (create-then-edit flow).
    //  - A patch RETARGETS by replacing `/A`; the reader gives `/A`
    //    precedence so a retarget wins over any stray direct `/Dest`.
    //  - Grouped links (v2 "attached links") are plain /IRT + /RT
    //    /Group — nothing link-specific in the relationship plane.
    // ─────────────────────────────────────────────────────────────────

    test('create link annotations round-trip uri, goto/xyz, goto/fitH, and dead targets', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);

        const uri = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: { kind: 'uri', uri: 'https://www.embedpdf.com/' },
        } satisfies LinkDraft);
        expect(AnnotationCreateResultSchema.safeParse(uri).success).toBe(true);
        expect(uri.created.subtype).toBe('link');
        if (uri.created.subtype === 'link') {
          expect(uri.created.target).toEqual({ kind: 'uri', uri: 'https://www.embedpdf.com/' });
        }

        // /XYZ with a null zoom axis: null means "retain current".
        const xyz = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: {
            kind: 'goto',
            destination: {
              kind: 'xyz',
              pageObjectNumber: fix.pageObjectNumber,
              left: 30,
              top: 500,
              zoom: null,
            },
          },
        } satisfies LinkDraft);
        expect(xyz.created.subtype).toBe('link');
        if (xyz.created.subtype === 'link') {
          expect(xyz.created.target?.kind).toBe('goto');
          if (xyz.created.target?.kind === 'goto') {
            const dest = xyz.created.target.destination;
            expect(dest.kind).toBe('xyz');
            if (dest.kind === 'xyz') {
              expect(dest.pageObjectNumber).toBe(fix.pageObjectNumber);
              expect(dest.left).toBe(30);
              expect(dest.top).toBe(500);
              expect(dest.zoom).toBe(null);
            }
          }
        }

        const fitH = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: {
            kind: 'goto',
            destination: { kind: 'fitH', pageObjectNumber: fix.pageObjectNumber, top: 420 },
          },
        } satisfies LinkDraft);
        expect(fitH.created.subtype).toBe('link');
        if (fitH.created.subtype === 'link' && fitH.created.target?.kind === 'goto') {
          expect(fitH.created.target.destination).toEqual({
            kind: 'fitH',
            pageObjectNumber: fix.pageObjectNumber,
            top: 420,
          });
        }

        // Dead link: legal to author, reported as-is.
        const dead = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: null,
        } satisfies LinkDraft);
        expect(dead.created.subtype).toBe('link');
        if (dead.created.subtype === 'link') expect(dead.created.target).toBe(null);

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
        const page = doc.page(fix.pageObjectNumber);
        const created = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: { kind: 'uri', uri: 'https://old.example/' },
        } satisfies LinkDraft);

        const toGoto = await page.annotations.update(created.created.ref, {
          subtype: 'link',
          target: {
            kind: 'goto',
            destination: { kind: 'fit', pageObjectNumber: fix.pageObjectNumber },
          },
        });
        expect(AnnotationUpdateResultSchema.safeParse(toGoto).success).toBe(true);
        if (toGoto.updated.subtype === 'link') {
          expect(toGoto.updated.target).toEqual({
            kind: 'goto',
            destination: { kind: 'fit', pageObjectNumber: fix.pageObjectNumber },
          });
        }

        const movedRect = {
          left: shapeRect.left + 5,
          bottom: shapeRect.bottom + 5,
          right: shapeRect.right + 5,
          top: shapeRect.top + 5,
        };
        const toUri = await page.annotations.update(created.created.ref, {
          subtype: 'link',
          rect: movedRect,
          target: { kind: 'uri', uri: 'https://new.example/' },
        });
        if (toUri.updated.subtype === 'link') {
          expect(toUri.updated.target).toEqual({ kind: 'uri', uri: 'https://new.example/' });
          expect(Math.round(toUri.updated.rect.left)).toBe(Math.round(movedRect.left));
        }
      } finally {
        await doc.close();
      }
    });

    test('a link patch clears the target with null — a dead link on re-read', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const created = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: {
            kind: 'goto',
            destination: { kind: 'fit', pageObjectNumber: fix.pageObjectNumber },
          },
        } satisfies LinkDraft);

        const cleared = await page.annotations.update(created.created.ref, {
          subtype: 'link',
          target: null,
        });
        expect(AnnotationUpdateResultSchema.safeParse(cleared).success).toBe(true);
        if (cleared.updated.subtype === 'link') expect(cleared.updated.target).toBe(null);

        // Truly dead — a fresh page read agrees (both /A and /Dest gone).
        const after = await page.annotations.list();
        const readBack = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            created.created.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === created.created.ref.annotObjectNumber,
        );
        expect(readBack?.subtype).toBe('link');
        if (readBack?.subtype === 'link') expect(readBack.target).toBe(null);

        // And a cleared link can be re-targeted afterwards.
        const revived = await page.annotations.update(created.created.ref, {
          subtype: 'link',
          target: { kind: 'uri', uri: 'https://revived.example/' },
        });
        if (revived.updated.subtype === 'link') {
          expect(revived.updated.target).toEqual({
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
        const page = doc.page(fix.pageObjectNumber);
        const parent = await page.annotations.create({
          subtype: 'highlight',
          contents: 'linked text',
          quadPoints: quad,
        } satisfies HighlightDraft);

        const link = await page.annotations.create({
          subtype: 'link',
          rect: shapeRect,
          target: { kind: 'uri', uri: 'https://www.embedpdf.com/docs' },
          inReplyTo: parent.created.ref,
          replyType: 'group',
        } satisfies LinkDraft);
        expect(AnnotationCreateResultSchema.safeParse(link).success).toBe(true);
        expect(link.created.replyType).toBe('group');
        expect(link.created.inReplyTo === null).toBe(false);
        if (
          link.created.inReplyTo?.kind === 'objectNumber' &&
          parent.created.ref.kind === 'objectNumber'
        ) {
          expect(link.created.inReplyTo.annotObjectNumber).toBe(
            parent.created.ref.annotObjectNumber,
          );
        }

        // Both the relationship AND the target survive a fresh read.
        const after = await page.annotations.list();
        const readLink = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            link.created.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === link.created.ref.annotObjectNumber,
        );
        expect(readLink?.subtype).toBe('link');
        expect(readLink?.replyType).toBe('group');
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
        const page = doc.page(fix.pageObjectNumber);
        const caret = await page.annotations.create({
          subtype: 'caret',
          intent: 'replace',
          contents: 'replacement text',
          rect: shapeRect,
          color: { r: 228, g: 66, b: 52 },
          opacity: 1,
          rectDifferences: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
        } satisfies CaretDraft);
        const strikeout = await page.annotations.create({
          subtype: 'strikeout',
          intent: 'strikeout-text-edit',
          quadPoints: quad,
          color: { r: 228, g: 66, b: 52 },
          opacity: 1,
          inReplyTo: caret.created.ref,
          replyType: 'group',
        } satisfies StrikeoutDraft);

        expect(caret.created.subtype).toBe('caret');
        if (caret.created.subtype === 'caret') expect(caret.created.intent).toBe('replace');
        expect(strikeout.created.subtype).toBe('strikeout');
        if (strikeout.created.subtype === 'strikeout') {
          expect(strikeout.created.intent).toBe('strikeout-text-edit');
        }
        expect(strikeout.created.replyType).toBe('group');
        expect(strikeout.created.inReplyTo).toEqual(caret.created.ref);

        const after = await page.annotations.list();
        const readCaret = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            caret.created.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === caret.created.ref.annotObjectNumber,
        );
        const readStrikeout = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            strikeout.created.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === strikeout.created.ref.annotObjectNumber,
        );
        expect(readCaret?.subtype === 'caret' && readCaret.intent).toBe('replace');
        expect(readStrikeout?.subtype === 'strikeout' && readStrikeout.intent).toBe(
          'strikeout-text-edit',
        );
        expect(readStrikeout?.replyType).toBe('group');
        expect(readStrikeout?.inReplyTo).toEqual(caret.created.ref);
      } finally {
        await doc.close();
      }
    });

    test('patch inReplyTo: null clears /IRT and /RT (back to top-level)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const parent = await page.annotations.create({
          subtype: 'highlight',
          contents: 'clear parent',
          quadPoints: quad,
        } satisfies HighlightDraft);
        const reply = await page.annotations.create({
          subtype: 'highlight',
          contents: 'clearable reply',
          quadPoints: quad,
          inReplyTo: parent.created.ref,
        } satisfies HighlightDraft);
        expect(reply.created.replyType).toBe('reply');

        const cleared = await page.annotations.update(reply.created.ref, {
          subtype: 'highlight',
          inReplyTo: null,
        });
        expect(AnnotationUpdateResultSchema.safeParse(cleared).success).toBe(true);
        expect(cleared.updated.inReplyTo).toBe(null);
        expect(cleared.updated.replyType).toBe(null);
      } finally {
        await doc.close();
      }
    });

    test('create with a cross-page /IRT parent throws InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        const parent = await page.annotations.create({
          subtype: 'highlight',
          contents: 'cross-page parent',
          quadPoints: quad,
        } satisfies HighlightDraft);
        if (parent.created.ref.kind !== 'objectNumber') return;

        // Same annotation object number, but a deliberately different page:
        // the engine must reject before resolving anything (ISO requires
        // reply and parent on the same page).
        const crossPageRef: AnnotationRef = {
          kind: 'objectNumber',
          pageObjectNumber: fix.pageObjectNumber + 2,
          annotObjectNumber: parent.created.ref.annotObjectNumber,
        };
        let caught: unknown;
        try {
          await page.annotations.create({
            subtype: 'highlight',
            contents: 'bad cross-page reply',
            quadPoints: quad,
            inReplyTo: crossPageRef,
          } satisfies HighlightDraft);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    // ─────────────────────────────────────────────────────────────────
    //  /State + /StateModel (review status, ISO 32000 §12.5.6.3) and
    //  /Subj. Locked rules:
    //  - A status change is a NEW text annotation replying to its target
    //    via /IRT; the target annotation itself is never modified.
    //  - Faithful reads: `state` / `stateModel` / `subject` are null iff
    //    the PDF entry is absent — a null after a null-clear patch proves
    //    TRUE key removal (EPDFAnnot_RemoveKey), not an empty-string
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
        const page = doc.page(fix.pageObjectNumber);
        const target = await page.annotations.create({
          subtype: 'highlight',
          contents: 'status target',
          subject: 'Pricing question',
          quadPoints: quad,
        } satisfies HighlightDraft);
        expect(target.created.subject).toBe('Pricing question');

        const status = await page.annotations.create({
          subtype: 'text',
          rect: shapeRect,
          inReplyTo: target.created.ref,
          state: 'accepted',
          stateModel: 'review',
        } satisfies TextDraft);
        expect(AnnotationCreateResultSchema.safeParse(status).success).toBe(true);
        expect(status.created.subtype).toBe('text');
        if (status.created.subtype !== 'text') return;
        expect(status.created.state).toBe('accepted');
        expect(status.created.stateModel).toBe('review');
        // A state annotation is a reply like any other.
        expect(status.created.replyType).toBe('reply');

        // The entries survive a fresh read.
        const after = await page.annotations.list();
        const read = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            status.created.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === status.created.ref.annotObjectNumber,
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

    test('a draft /State without /StateModel is rejected with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(fix.pageObjectNumber);
        let caught: unknown;
        try {
          await page.annotations.create({
            subtype: 'text',
            rect: shapeRect,
            state: 'accepted',
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
        const page = doc.page(fix.pageObjectNumber);
        const note = await page.annotations.create({
          subtype: 'text',
          rect: shapeRect,
          contents: 'work in progress',
          subject: 'Draft',
          state: 'none',
          stateModel: 'review',
        } satisfies TextDraft);

        // Cycle the state alone — the model already on the annotation
        // stays; state entries never touch the appearance.
        const cycled = await page.annotations.update(note.created.ref, {
          subtype: 'text',
          state: 'rejected',
        } satisfies TextPatch);
        expect(cycled.appearance.changed).toBe(false);
        expect(cycled.updated.subtype).toBe('text');
        if (cycled.updated.subtype === 'text') {
          expect(cycled.updated.state).toBe('rejected');
          expect(cycled.updated.stateModel).toBe('review');
        }

        const cleared = await page.annotations.update(note.created.ref, {
          subtype: 'text',
          contents: null,
          subject: null,
          state: null,
          stateModel: null,
        } satisfies TextPatch);
        expect(cleared.appearance.changed).toBe(false);
        expect(cleared.updated.contents).toBe(null);
        expect(cleared.updated.subject).toBe(null);
        if (cleared.updated.subtype === 'text') {
          expect(cleared.updated.state).toBe(null);
          expect(cleared.updated.stateModel).toBe(null);
        }

        // Faithful read: null distinguishes absent from ''. Null here
        // proves the entries were REMOVED, not overwritten with an empty
        // string.
        const after = await page.annotations.list();
        const read = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            note.created.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === note.created.ref.annotObjectNumber,
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
        const page = doc.page(fix.pageObjectNumber);
        const custom = await page.annotations.create({
          subtype: 'text',
          rect: shapeRect,
          state: 'in-progress',
          stateModel: 'X-ReviewWorkflow',
        } satisfies TextDraft);
        expect(custom.created.subtype).toBe('text');
        if (custom.created.subtype !== 'text') return;
        expect(custom.created.state).toBe('in-progress');
        expect(custom.created.stateModel).toBe('X-ReviewWorkflow');

        const after = await page.annotations.list();
        const read = after.annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            custom.created.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === custom.created.ref.annotObjectNumber,
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

async function beginWeakEditIfRequired(
  doc: DocumentHandle,
  pageObjectNumber: number,
  fix: AnnotationMutationConformanceFixture,
): Promise<WeakAnnotationEditSession | null> {
  if (doc.capabilities.weakAnnotationEditSessions !== 'required' || !fix.expectsWeakAnnotation) {
    return null;
  }
  return doc.annotations.beginWeakEdit([pageObjectNumber]);
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
