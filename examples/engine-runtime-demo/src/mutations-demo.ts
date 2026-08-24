import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationListPageSnapshot,
  AnnotationMoveResult,
  AnnotationRef,
  AnnotationUpdateResult,
  HighlightDraft,
} from '@embedpdf/engine-core';
import type { Engine } from '@embedpdf/engine-core/runtime';

/**
 * Engine-agnostic mutation walkthrough. Drives `update` (weak →
 * /NM-stamped), `create`, two `move` operations (single-as-batch and
 * multi-block contiguous reorder), and finally `delete` to leave the
 * fixture as we found it. Returns the observable side-effects so the
 * node + browser entries can render exactly the same payload.
 */
export interface MutationsDemoResult {
  label: string;
  docId: string;
  elapsedMs: number;
  before: AnnotationListPageSnapshot;
  createdA: AnnotationCreateResult;
  createdB: AnnotationCreateResult;
  createdCircle: AnnotationCreateResult;
  createdSquare: AnnotationCreateResult;
  createdPolygon: AnnotationCreateResult;
  createdPolyline: AnnotationCreateResult;
  createdLine: AnnotationCreateResult;
  updated: AnnotationUpdateResult | null;
  movedSingle: AnnotationMoveResult;
  movedBatch: AnnotationMoveResult;
  deletedA: AnnotationDeleteResult;
  deletedB: AnnotationDeleteResult;
  after: AnnotationListPageSnapshot;
}

const QUAD: HighlightDraft['quadPoints'] = [
  {
    p1: { x: 50, y: 100 },
    p2: { x: 150, y: 100 },
    p3: { x: 50, y: 80 },
    p4: { x: 150, y: 80 },
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
    const page = doc.page(pageObjectNumber);
    const before = await page.annotations.list();

    // 1) Update a weak annotation FIRST. Update is non-invalidating
    //    (no revision bump, no index shift), so any index refs we
    //    captured stay valid for the rest of the demo. We exercise
    //    update first specifically to demonstrate the opportunistic
    //    UUID v4 /NM stamp on a weak annotation; the resulting ref
    //    will be upgraded to `kind: 'nm'`.
    //
    //    (Note: `create` is also non-invalidating now — append-only,
    //    no revision bump — so the historical concern about "create
    //    invalidates `weak.ref`" no longer applies. We still keep the
    //    update-first ordering for narrative clarity in the demo
    //    output.)
    const weak = before.annotations.find((a) => a.identityQuality === 'weak');
    let updated: AnnotationUpdateResult | null = null;
    if (
      weak &&
      (weak.subtype === 'highlight' ||
        weak.subtype === 'underline' ||
        weak.subtype === 'squiggly' ||
        weak.subtype === 'strikeout')
    ) {
      updated = await page.annotations.update(weak.ref, {
        subtype: weak.subtype,
        contents: 'mutation demo: updated weak annot',
      });
    }

    // 2) Create two new highlights. Always durable (engine uses
    //    EPDFPage_CreateAnnot, which produces an indirect object).
    const createdA = await page.annotations.create({
      subtype: 'highlight',
      contents: 'mutation demo: A',
      color: { r: 30, g: 144, b: 255 },
      opacity: 0.4,
      quadPoints: QUAD,
    });
    const createdB = await page.annotations.create({
      subtype: 'highlight',
      contents: 'mutation demo: B',
      color: { r: 255, g: 99, b: 71 },
      opacity: 0.4,
      quadPoints: QUAD,
    });

    // 2b) Create a circle and a square. Shapes are /Rect-based (not quad
    //     based) and carry interior/stroke colour + border style. The
    //     mutator bakes an /AP appearance stream for them on create, so
    //     they render in any compliant viewer without a separate overlay.
    const createdCircle = await page.annotations.create({
      subtype: 'circle',
      contents: 'mutation demo: circle',
      rect: { left: 60, bottom: 300, right: 180, top: 400 },
      interiorColor: { r: 30, g: 144, b: 255 },
      color: { r: 0, g: 0, b: 139 },
      strokeWidth: 2,
      borderStyle: 'solid',
      opacity: 0.5,
    });
    const createdSquare = await page.annotations.create({
      subtype: 'square',
      contents: 'mutation demo: square',
      rect: { left: 220, bottom: 300, right: 360, top: 400 },
      interiorColor: null,
      color: { r: 220, g: 20, b: 60 },
      strokeWidth: 3,
      borderStyle: 'dashed',
      dashArray: [4, 2],
      opacity: 1,
    });

    // 2c) Create a polygon, polyline, and line. These carry explicit
    //     geometry (/Vertices or /L) plus the bounding /Rect the plugin
    //     owns; the engine writes them verbatim and bakes the /AP. The
    //     polyline/line also carry /LE line endings.
    const createdPolygon = await page.annotations.create({
      subtype: 'polygon',
      contents: 'mutation demo: polygon',
      rect: { left: 60, bottom: 450, right: 180, top: 550 },
      vertices: [
        { x: 70, y: 460 },
        { x: 170, y: 460 },
        { x: 120, y: 540 },
      ],
      interiorColor: { r: 255, g: 215, b: 0 },
      color: { r: 0, g: 0, b: 139 },
      strokeWidth: 2,
      borderStyle: 'solid',
      opacity: 0.7,
    });
    const createdPolyline = await page.annotations.create({
      subtype: 'polyline',
      contents: 'mutation demo: polyline',
      rect: { left: 220, bottom: 450, right: 360, top: 550 },
      vertices: [
        { x: 230, y: 460 },
        { x: 290, y: 540 },
        { x: 350, y: 460 },
      ],
      interiorColor: null,
      color: { r: 220, g: 20, b: 60 },
      strokeWidth: 2,
      borderStyle: 'solid',
      opacity: 1,
      lineEndings: { start: 'open-arrow', end: 'closed-arrow' },
    });
    const createdLine = await page.annotations.create({
      subtype: 'line',
      contents: 'mutation demo: line',
      rect: { left: 400, bottom: 450, right: 520, top: 550 },
      linePoints: { start: { x: 410, y: 460 }, end: { x: 510, y: 540 } },
      interiorColor: null,
      color: { r: 0, g: 128, b: 128 },
      strokeWidth: 2,
      borderStyle: 'solid',
      opacity: 1,
      lineEndings: { start: 'none', end: 'open-arrow' },
    });

    // 3) Single-annotation move: move B to position 0. This exercises
    //    `move([ref], toIndex)` as the single-as-batch case. Move is
    //    index-shifting, so this DOES bump the per-page revision.
    const movedSingle = await page.annotations.move([createdB.created.ref], 0);

    // 4) Multi-block move: move [A, B] to position 0 in caller order.
    //    Verifies that caller-supplied order is preserved at the
    //    destination, ONE revision bump per batch.
    const movedBatch = await page.annotations.move([createdA.created.ref, createdB.created.ref], 0);

    // 5) Delete both annotations we created so the fixture is unchanged.
    //    Use the still-stable durable refs (objectNumber survives
    //    arbitrary moves; that's the whole point of stable identity).
    const deletedA = await page.annotations.delete(createdA.created.ref);
    const deletedB = await page.annotations.delete(createdB.created.ref);
    // Clean up the shapes too so the fixture is left as we found it.
    await page.annotations.delete(createdCircle.created.ref);
    await page.annotations.delete(createdSquare.created.ref);
    await page.annotations.delete(createdPolygon.created.ref);
    await page.annotations.delete(createdPolyline.created.ref);
    await page.annotations.delete(createdLine.created.ref);

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
 * meta envelopes (revision generations, weakRefsInvalidated,
 * shouldRefetch reason) so the demo doubles as a visual contract for
 * the locked impact rules.
 */
export function summarizeMutations(result: MutationsDemoResult) {
  return {
    label: result.label,
    docId: result.docId,
    elapsedMs: result.elapsedMs,
    before: {
      generation: result.before.pageState.revision.generation,
      hasWeak: knownWeakFlag(result.before.pageState),
      count: result.before.annotations.length,
    },
    update: result.updated
      ? {
          inputRefKind: 'index',
          outputRef: refSummary(result.updated.updated.ref),
          outputNm: result.updated.updated.nm,
          identityQuality: result.updated.updated.identityQuality,
          meta: metaSummary(result.updated.meta),
        }
      : { skipped: 'no weak annotation on the page' },
    createA: {
      ref: refSummary(result.createdA.created.ref),
      identityQuality: result.createdA.created.identityQuality,
      meta: metaSummary(result.createdA.meta),
    },
    createB: {
      ref: refSummary(result.createdB.created.ref),
      identityQuality: result.createdB.created.identityQuality,
      meta: metaSummary(result.createdB.meta),
    },
    createCircle: {
      ref: refSummary(result.createdCircle.created.ref),
      subtype: result.createdCircle.created.subtype,
      identityQuality: result.createdCircle.created.identityQuality,
      meta: metaSummary(result.createdCircle.meta),
    },
    createSquare: {
      ref: refSummary(result.createdSquare.created.ref),
      subtype: result.createdSquare.created.subtype,
      identityQuality: result.createdSquare.created.identityQuality,
      meta: metaSummary(result.createdSquare.meta),
    },
    createPolygon: {
      ref: refSummary(result.createdPolygon.created.ref),
      subtype: result.createdPolygon.created.subtype,
      identityQuality: result.createdPolygon.created.identityQuality,
      meta: metaSummary(result.createdPolygon.meta),
    },
    createPolyline: {
      ref: refSummary(result.createdPolyline.created.ref),
      subtype: result.createdPolyline.created.subtype,
      identityQuality: result.createdPolyline.created.identityQuality,
      meta: metaSummary(result.createdPolyline.meta),
    },
    createLine: {
      ref: refSummary(result.createdLine.created.ref),
      subtype: result.createdLine.created.subtype,
      identityQuality: result.createdLine.created.identityQuality,
      meta: metaSummary(result.createdLine.meta),
    },
    moveSingle: {
      moved: result.movedSingle.moved.map((d) => refSummary(d.ref)),
      meta: metaSummary(result.movedSingle.meta),
    },
    moveBatch: {
      moved: result.movedBatch.moved.map((d) => refSummary(d.ref)),
      meta: metaSummary(result.movedBatch.meta),
    },
    deleteA: {
      deleted: result.deletedA.deleted,
      meta: metaSummary(result.deletedA.meta),
    },
    deleteB: {
      deleted: result.deletedB.deleted,
      meta: metaSummary(result.deletedB.meta),
    },
    after: {
      generation: result.after.pageState.revision.generation,
      hasWeak: knownWeakFlag(result.after.pageState),
      count: result.after.annotations.length,
    },
  };
}

function refSummary(ref: AnnotationRef): string {
  switch (ref.kind) {
    case 'objectNumber':
      return `objectNumber=${ref.annotObjectNumber}`;
    case 'nm':
      return `nm=${ref.nm}`;
    case 'index':
      return `index=${ref.index}`;
    default:
      return exhaustiveRef(ref);
  }
}

function exhaustiveRef(ref: never): string {
  return String(ref);
}

function metaSummary(meta: AnnotationCreateResult['meta']) {
  const pageState = meta.affectedPages[0];
  return {
    generation: pageState?.revision.generation ?? null,
    weakRefsInvalidated: meta.weakRefsInvalidated,
    shouldRefetch: meta.shouldRefetch?.reason ?? null,
    changed: meta.changed.map((c) => `${c.kind}=${String(c.value)}`),
    cacheDelta: meta.cacheDelta
      ? {
          previousDocVersion: meta.cacheDelta.previousDocVersion,
          docVersion: meta.cacheDelta.docVersion,
          pages: meta.cacheDelta.pages.length,
        }
      : null,
  };
}

function knownWeakFlag(pageState: AnnotationListPageSnapshot['pageState']): boolean | null {
  return pageState.weakAnnotationState.kind === 'known'
    ? pageState.weakAnnotationState.hasAnyWeakAnnotations
    : null;
}
