import type { PageListSnapshot, PageMoveResult } from '@embedpdf/engine-core';
import type { Engine } from '@embedpdf/engine-core/runtime';

/**
 * Engine-agnostic page-reorder walkthrough. Drives `pages.list()`,
 * one single-page move, and one multi-page contiguous-block move. The
 * walkthrough then re-asserts the geometry-level invariants:
 *
 *   - `pages.list()` reports every page in display order, with durable
 *     PONs and dense `index`.
 *   - Set of PONs is preserved across the move (no page lost or
 *     fabricated).
 *
 * `pages.list()` is geometry-only; annotation liveness (per-page
 * `RevisionToken`s and their survival across a move) is an annotation
 * concern and is covered by the annotation/reorder conformance suites, not
 * here.
 *
 * Returns the observable side-effects so the node + browser entries
 * can render the same payload.
 */
export interface PagesDemoResult {
  label: string;
  docId: string;
  elapsedMs: number;
  before: PageListSnapshot;
  movedSingle: PageMoveResult;
  movedBatch: PageMoveResult;
  after: PageListSnapshot;
  /** Computed for the summary; true means the geometry invariants held. */
  invariants: {
    ponSetPreserved: boolean;
    indicesDense: boolean;
  };
}

export async function runPagesDemo(
  label: string,
  engine: Engine,
  pdfBytes: Uint8Array,
  docId = `pages-demo-${label}`,
): Promise<PagesDemoResult> {
  const started = Date.now();
  const doc = await engine.open({ kind: 'bytes', id: docId, bytes: pdfBytes });
  try {
    const before = await doc.pages.list();
    if (before.pages.length < 2) {
      throw new Error(`pages demo requires at least 2 pages; fixture has ${before.pages.length}`);
    }

    // 1) Single-page move: send the LAST page to the FRONT.
    const lastPon = before.pages[before.pages.length - 1].pageObjectNumber;
    const movedSingle = await doc.pages.move([lastPon], 0);

    // 2) Multi-page contiguous-block move: send pages [0, 1] (post-
    //    single-move order) to the END. Mirrors `FPDF_MovePages`
    //    semantics — the block is detached and re-inserted at the
    //    destination in the post-removal index space, preserving
    //    caller order.
    const singlePageOrder = movedSingle.layout.pages;
    if (singlePageOrder.length >= 3) {
      const block = [singlePageOrder[0].pageObjectNumber, singlePageOrder[1].pageObjectNumber];
      const dest = singlePageOrder.length - block.length;
      const movedBatch = await doc.pages.move(block, dest);
      const after = await doc.pages.list();

      return {
        label,
        docId: doc.id,
        elapsedMs: Date.now() - started,
        before,
        movedSingle,
        movedBatch,
        after,
        invariants: computeInvariants(before, after),
      };
    }

    // <3 pages — report the single-move twice so the demo is still
    // observable without crashing.
    const after = await doc.pages.list();
    return {
      label,
      docId: doc.id,
      elapsedMs: Date.now() - started,
      before,
      movedSingle,
      movedBatch: movedSingle,
      after,
      invariants: computeInvariants(before, after),
    };
  } finally {
    await doc.close();
  }
}

function computeInvariants(
  before: PageListSnapshot,
  after: PageListSnapshot,
): PagesDemoResult['invariants'] {
  const beforePons = new Set(before.pages.map((p) => p.pageObjectNumber));
  const afterPons = new Set(after.pages.map((p) => p.pageObjectNumber));
  let ponSetPreserved = beforePons.size === afterPons.size;
  if (ponSetPreserved) {
    for (const pon of beforePons) {
      if (!afterPons.has(pon)) {
        ponSetPreserved = false;
        break;
      }
    }
  }
  let indicesDense = true;
  for (let i = 0; i < after.pages.length; i++) {
    if (after.pages[i].index !== i) {
      indicesDense = false;
      break;
    }
  }
  return { ponSetPreserved, indicesDense };
}

export function summarizePages(result: PagesDemoResult) {
  return {
    label: result.label,
    docId: result.docId,
    elapsedMs: result.elapsedMs,
    before: result.before.pages.map((p) => ({
      pon: p.pageObjectNumber,
      idx: p.index,
      w: p.size.width,
      h: p.size.height,
      rot: p.rotation,
    })),
    movedSingle: result.movedSingle.layout.pages.map((p) => ({
      pon: p.pageObjectNumber,
      idx: p.index,
    })),
    movedBatch: result.movedBatch.layout.pages.map((p) => ({
      pon: p.pageObjectNumber,
      idx: p.index,
    })),
    after: result.after.pages.map((p) => ({
      pon: p.pageObjectNumber,
      idx: p.index,
      w: p.size.width,
      h: p.size.height,
      rot: p.rotation,
    })),
    invariants: result.invariants,
  };
}
