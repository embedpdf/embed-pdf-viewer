import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationList,
  AnnotationReorderResult,
  AnnotationRef,
  AnnotationUpdateResult,
  HighlightDraft,
} from '@embedpdf/engine-core';
import { deletedAnnotationsOf, toPageRef, type Engine } from '@embedpdf/engine-core/runtime';

/**
 * Engine-agnostic mutation walkthrough. Drives `update` (of an annotation
 * born inline, which keeps its `baseIndex` name), `create`, two `move`
 * operations (single-as-batch and multi-block contiguous reorder), and
 * finally `delete` to leave the fixture as we found it. Returns the observable side-effects so the
 * node + browser entries can render exactly the same payload.
 */
export interface MutationsDemoResult {
  label: string;
  docId: string;
  elapsedMs: number;
  before: AnnotationList;
  createdA: AnnotationCreateResult;
  createdB: AnnotationCreateResult;
  createdCircle: AnnotationCreateResult;
  createdSquare: AnnotationCreateResult;
  createdPolygon: AnnotationCreateResult;
  createdPolyline: AnnotationCreateResult;
  createdLine: AnnotationCreateResult;
  updated: AnnotationUpdateResult | null;
  movedSingle: AnnotationReorderResult;
  movedBatch: AnnotationReorderResult;
  deletedA: AnnotationDeleteResult;
  deletedB: AnnotationDeleteResult;
  after: AnnotationList;
}

const QUAD: HighlightDraft['quadPoints'] = [
  {
    upperLeft: { x: 50, y: 692 },
    upperRight: { x: 150, y: 692 },
    lowerLeft: { x: 50, y: 712 },
    lowerRight: { x: 150, y: 712 },
  },
];

export async function runMutationsDemo(
  label: string,
  engine: Engine,
  pdfBytes: Uint8Array,
  pageObjectNumber: number,
  docId = `mutations-demo-${label}`,
): Promise<MutationsDemoResult> {
  const started = Date.now();
  const doc = await engine.open({ kind: 'bytes', id: docId, bytes: pdfBytes });
  try {
    const page = doc.page(toPageRef(pageObjectNumber));
    const before = await page.annotations.list();

    // 1) Update an annotation the file stores inline (without an object
    //    number of its own). It is named by the position it was born at
    //    (`baseIndex`), and keeps that name through every write.
    const inline = before.annotations.find((a) => a.ref.kind === 'baseIndex');
    let updated: AnnotationUpdateResult | null = null;
    if (
      inline &&
      (inline.subtype === 'highlight' ||
        inline.subtype === 'underline' ||
        inline.subtype === 'squiggly' ||
        inline.subtype === 'strikeout')
    ) {
      updated = await page.annotations.update(inline.ref, {
        subtype: inline.subtype,
        contents: 'mutation demo: updated inline annot',
      });
    }

    // 2) Create two new highlights. Always durable (engine uses
    //    EPDFPage_CreateAnnot, which produces an indirect object).
    const createdA = await page.annotations.create({
      subtype: 'highlight',
      contents: 'mutation demo: A',
      color: '#1e90ff',
      opacity: 0.4,
      quadPoints: QUAD,
    });
    const createdB = await page.annotations.create({
      subtype: 'highlight',
      contents: 'mutation demo: B',
      color: '#ff6347',
      opacity: 0.4,
      quadPoints: QUAD,
    });

    // 2b) Create a circle and a square. Shapes are box-based (not quad
    //     based) and carry interior/stroke colour + border style. The
    //     mutator bakes an /AP appearance stream for them on create, so
    //     they render in any compliant viewer without a separate overlay.
    const createdCircle = await page.annotations.create({
      subtype: 'circle',
      contents: 'mutation demo: circle',
      box: { x: 60, y: 392, width: 120, height: 100 },
      interiorColor: '#1e90ff',
      color: '#00008b',
      strokeWidth: 2,
      borderStyle: 'solid',
      opacity: 0.5,
    });
    const createdSquare = await page.annotations.create({
      subtype: 'square',
      contents: 'mutation demo: square',
      box: { x: 220, y: 392, width: 140, height: 100 },
      interiorColor: null,
      color: '#dc143c',
      strokeWidth: 3,
      borderStyle: 'dashed',
      dashArray: [4, 2],
      opacity: 1,
    });

    // 2c) Create a polygon, polyline, and line. These carry their points
    //     (/Vertices or /L); the engine draws the /AP and works out /Rect
    //     from what it draws. The polyline/line also carry /LE line endings.
    const createdPolygon = await page.annotations.create({
      subtype: 'polygon',
      contents: 'mutation demo: polygon',
      vertices: [
        { x: 70, y: 332 },
        { x: 170, y: 332 },
        { x: 120, y: 252 },
      ],
      interiorColor: '#ffd700',
      color: '#00008b',
      strokeWidth: 2,
      borderStyle: 'solid',
      opacity: 0.7,
    });
    const createdPolyline = await page.annotations.create({
      subtype: 'polyline',
      contents: 'mutation demo: polyline',
      vertices: [
        { x: 230, y: 332 },
        { x: 290, y: 252 },
        { x: 350, y: 332 },
      ],
      interiorColor: null,
      color: '#dc143c',
      strokeWidth: 2,
      borderStyle: 'solid',
      opacity: 1,
      lineEndings: { start: 'open-arrow', end: 'closed-arrow' },
    });
    const createdLine = await page.annotations.create({
      subtype: 'line',
      contents: 'mutation demo: line',
      linePoints: { start: { x: 410, y: 332 }, end: { x: 510, y: 252 } },
      interiorColor: null,
      color: '#008080',
      strokeWidth: 2,
      borderStyle: 'solid',
      opacity: 1,
      lineEndings: { start: 'none', end: 'open-arrow' },
    });

    // 3) Single-annotation reorder: B to the bottom of the stack.
    const movedSingle = await page.annotations.reorder([createdB.annotation.ref], 'start');

    // 4) Multi-annotation reorder: [A, B] to the bottom, in caller order.
    const movedBatch = await page.annotations.reorder(
      [createdA.annotation.ref, createdB.annotation.ref],
      'start',
    );

    // 5) Delete both annotations we created so the fixture is unchanged.
    //    Their refs survive the reorders: a ref is an annotation's name for
    //    life.
    const deletedA = await page.annotations.delete(createdA.annotation.ref);
    const deletedB = await page.annotations.delete(createdB.annotation.ref);
    // Clean up the shapes too so the fixture is left as we found it.
    await page.annotations.delete(createdCircle.annotation.ref);
    await page.annotations.delete(createdSquare.annotation.ref);
    await page.annotations.delete(createdPolygon.annotation.ref);
    await page.annotations.delete(createdPolyline.annotation.ref);
    await page.annotations.delete(createdLine.annotation.ref);

    const after = await page.annotations.list();

    return {
      label,
      docId: doc.id,
      elapsedMs: Date.now() - started,
      before,
      createdA,
      createdB,
      createdCircle,
      createdSquare,
      createdPolygon,
      createdPolyline,
      createdLine,
      updated,
      movedSingle,
      movedBatch,
      deletedA,
      deletedB,
      after,
    };
  } finally {
    await doc.close();
  }
}

/**
 * Compact human-readable view of a `MutationsDemoResult`. Includes the
 * meta envelopes (the refs each write changed, the cache delta) so the demo
 * doubles as a visual contract for them.
 */
export function summarizeMutations(result: MutationsDemoResult) {
  return {
    label: result.label,
    docId: result.docId,
    elapsedMs: result.elapsedMs,
    before: { count: result.before.annotations.length },
    update: result.updated
      ? {
          ref: refSummary(result.updated.annotation.ref),
          nm: result.updated.annotation.nm,
          meta: metaSummary(result.updated.meta),
        }
      : { skipped: 'no inline annotation on the page' },
    createA: {
      ref: refSummary(result.createdA.annotation.ref),
      meta: metaSummary(result.createdA.meta),
    },
    createB: {
      ref: refSummary(result.createdB.annotation.ref),
      meta: metaSummary(result.createdB.meta),
    },
    createCircle: {
      ref: refSummary(result.createdCircle.annotation.ref),
      subtype: result.createdCircle.annotation.subtype,
      meta: metaSummary(result.createdCircle.meta),
    },
    createSquare: {
      ref: refSummary(result.createdSquare.annotation.ref),
      subtype: result.createdSquare.annotation.subtype,
      meta: metaSummary(result.createdSquare.meta),
    },
    createPolygon: {
      ref: refSummary(result.createdPolygon.annotation.ref),
      subtype: result.createdPolygon.annotation.subtype,
      meta: metaSummary(result.createdPolygon.meta),
    },
    createPolyline: {
      ref: refSummary(result.createdPolyline.annotation.ref),
      subtype: result.createdPolyline.annotation.subtype,
      meta: metaSummary(result.createdPolyline.meta),
    },
    createLine: {
      ref: refSummary(result.createdLine.annotation.ref),
      subtype: result.createdLine.annotation.subtype,
      meta: metaSummary(result.createdLine.meta),
    },
    moveSingle: {
      moved: result.movedSingle.meta.changed.map(refSummary),
      meta: metaSummary(result.movedSingle.meta),
    },
    moveBatch: {
      moved: result.movedBatch.meta.changed.map(refSummary),
      meta: metaSummary(result.movedBatch.meta),
    },
    deleteA: {
      deleted: deletedAnnotationsOf(result.deletedA).map(refSummary),
      meta: metaSummary(result.deletedA.meta),
    },
    deleteB: {
      deleted: deletedAnnotationsOf(result.deletedB).map(refSummary),
      meta: metaSummary(result.deletedB.meta),
    },
    after: { count: result.after.annotations.length },
  };
}

function refSummary(ref: AnnotationRef): string {
  switch (ref.kind) {
    case 'objectNumber':
      return `objectNumber=${ref.objectNumber}`;
    case 'baseIndex':
      return `baseIndex=${ref.baseIndex}`;
    default:
      return exhaustiveRef(ref);
  }
}

function exhaustiveRef(ref: never): string {
  return String(ref);
}

function metaSummary(meta: AnnotationCreateResult['meta']) {
  return {
    changed: meta.changed.map(refSummary),
    cacheDelta: meta.cacheDelta
      ? {
          previousDocVersion: meta.cacheDelta.previousDocVersion,
          docVersion: meta.cacheDelta.docVersion,
          pages: meta.cacheDelta.pages.length,
        }
      : null,
  };
}
