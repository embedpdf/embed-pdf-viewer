/**
 * A page's stacking order, per family. A page's `/Annots` holds both of its
 * families, but PDFium paints every annotation and then every widget
 * (`CPDF_AnnotList::DisplayAnnots`), so each family has an order of its own,
 * later over earlier, and where the two interleave shows nowhere. A reorder
 * moves rows of one family next to a neighbour of the same family, as one
 * block move in `/Annots`: the rows land beside their own family's rows and
 * the other family keeps its order.
 */
import {
  anchorOf,
  annotationKey,
  EngineError,
  EngineErrorCode,
  reorderedList,
  type AnnotationFamily,
  type AnnotationPosition,
  type AnnotationRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { familyOfCode } from './familyOfCode';
import { annotationRefOf } from './identity/annotationName';
import { promoteInlineAnnotations } from './write/promoteInlineAnnotations';
import type { DocumentSession } from '../../../document-session/DocumentSession';
import { withScratch } from '../../../runtime/memory/scratch';

/** One entry of a page's `/Annots`: the annotation it holds and its family. */
interface StackEntry {
  readonly ref: AnnotationRef;
  readonly family: AnnotationFamily;
}

/** A page's `/Annots` as it is now, read from its dictionaries without loading the page. */
export interface PageStack {
  readonly page: PageRef;
  readonly pageIndex: number;
  /** Every entry in `/Annots` order; `null` for one that can't be opened. */
  readonly entries: readonly (StackEntry | null)[];
}

export function readPageStack(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  page: PageRef,
): PageStack {
  const { fn, mem } = runtime;
  const docPtr = session.requireDocPtr();
  const { pageIndex } = session.resolvePageRef(page);
  const count = fn.EPDFPage_GetAnnotCountRaw(docPtr, pageIndex);
  const entries: (StackEntry | null)[] = [];
  for (let index = 0; index < count; index++) {
    const annotPtr = fn.EPDFPage_GetAnnotRaw(docPtr, pageIndex, index);
    if (!annotPtr) {
      entries.push(null);
      continue;
    }
    try {
      entries.push({
        ref: annotationRefOf(fn, mem, docPtr, page, annotPtr, index),
        family: familyOfCode(fn.FPDFAnnot_GetSubtype(annotPtr)),
      });
    } finally {
      fn.FPDFPage_CloseAnnot(annotPtr);
    }
  }
  return { page, pageIndex, entries };
}

/** `family`'s rows on the page, bottom to top. */
export function familyOrder(stack: PageStack, family: AnnotationFamily): AnnotationRef[] {
  return stack.entries.flatMap((entry) => (entry?.family === family ? [entry.ref] : []));
}

/** A reorder worked out against a page's stack, before anything is written. */
export interface PlannedReorder {
  readonly stack: PageStack;
  readonly family: AnnotationFamily;
  /** The family's rows before the reorder, bottom to top. */
  readonly before: AnnotationRef[];
  /** The family's rows after it. */
  readonly after: AnnotationRef[];
  /** The `/Annots` positions of the rows that move, in the order given. */
  readonly from: number[];
  /** Where they go together, as a position in the `/Annots` left once they are out. */
  readonly to: number;
}

/**
 * Where `refs` go when they move together, in the order given, to `position`
 * among `family`'s rows. Refuses before anything is written: a row or a
 * neighbour of the other family, or on another page, is `InvalidArg` naming
 * the verb that orders it; so is a row named twice and a neighbour that is
 * one of the rows. A row or a neighbour that isn't on the page is `NotFound`.
 */
export function planReorder(
  stack: PageStack,
  family: AnnotationFamily,
  refs: readonly AnnotationRef[],
  position: AnnotationPosition,
): PlannedReorder {
  if (refs.length === 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'a reorder names at least one row', {
      details: { field: 'refs' },
    });
  }
  const at = new Map<string, number>();
  stack.entries.forEach((entry, index) => {
    if (entry) at.set(annotationKey(entry.ref), index);
  });
  const anchor = anchorOf(position);
  const named = anchor ? [...refs, anchor] : refs;
  named.forEach((ref, i) => {
    const field = anchor && i === refs.length ? 'position' : 'refs';
    if (ref.page.objectNumber !== stack.page.objectNumber) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `${annotationKey(ref)} is on page ${ref.page.objectNumber}; a reorder stays on page ${stack.page.objectNumber}`,
        { details: { field } },
      );
    }
    const index = at.get(annotationKey(ref));
    const entry = index === undefined ? null : stack.entries[index];
    if (entry && entry.family !== family) {
      throw new EngineError(EngineErrorCode.InvalidArg, otherFamily(entry.family), {
        details: { field },
      });
    }
  });

  const before = familyOrder(stack, family);
  const after = reorderedList(before, refs, position, annotationKey);

  const from = refs.map((ref) => at.get(annotationKey(ref))!);
  const moving = new Set(from);
  // A position once the moving rows are out.
  const kept = (index: number) => index - from.filter((f) => f < index).length;
  const staying = before
    .map((ref) => at.get(annotationKey(ref))!)
    .filter((index) => !moving.has(index));
  const first = Math.min(...from);
  let to: number;
  if (position === 'start') to = staying.length > 0 ? kept(staying[0]!) : first;
  else if (position === 'end') to = staying.length > 0 ? kept(staying.at(-1)!) + 1 : first;
  else {
    const neighbour = kept(at.get(annotationKey(anchor!))!);
    to = 'before' in position ? neighbour : neighbour + 1;
  }
  return { stack, family, before, after, from, to };
}

/** Writes a planned reorder: one block move in the page's `/Annots`. */
export function applyReorder(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  plan: PlannedReorder,
): void {
  const { fn, mem } = runtime;
  // Promotion keeps every position, so the plan's still hold.
  promoteInlineAnnotations(runtime, session, plan.stack.page.objectNumber);
  const moved = withScratch(mem, 4 * plan.from.length, (arrPtr) => {
    plan.from.forEach((index, i) => mem.poke(arrPtr, 'i32', index, 4 * i));
    return fn.EPDFPage_MoveAnnotsRaw(
      session.requireDocPtr(),
      plan.stack.pageIndex,
      arrPtr,
      plan.from.length,
      plan.to,
    );
  });
  if (!moved) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      `the annotations of page ${plan.stack.page.objectNumber} could not be reordered`,
    );
  }
}

/** Why a row of `family` isn't ordered by the other family's verb. */
function otherFamily(family: AnnotationFamily): string {
  return family === 'widgets'
    ? 'widgets paint above every annotation and have an order of their own: reorder them with doc.forms.reorderWidgets'
    : 'annotations paint below every widget and have an order of their own: reorder them with page.annotations.reorder';
}
