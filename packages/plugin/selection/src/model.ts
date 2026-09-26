/**
 * The selection's session state: the range, its derived page-space segments
 * and two facts. Every function below is a pure transition or projection;
 * the controller applies the transitions with `ctx.state.update`.
 */
import type { DocumentEvent, PageObjectNumber, PageRef } from '@embedpdf/core';
import type { TextQuad } from '@embedpdf/core-geometry';
import type { SelectionSegment } from './geometry';

/** A glyph address: a page and a character index within that page. */
export interface GlyphPosition {
  readonly page: PageRef;
  readonly glyph: number;
}

/** Anchor = where the selection began, focus = the current end. Inclusive. */
export interface SelectionRange {
  readonly anchor: GlyphPosition;
  readonly focus: GlyphPosition;
}

/** Page object number → that page's segments, in page space. */
export type SegmentsByPage = Readonly<Record<PageObjectNumber, readonly SelectionSegment[]>>;

export interface SelectionState {
  readonly selection: SelectionRange | null;
  /** Per-line segments derived from the range, per page, in page space. */
  readonly segments: SegmentsByPage;
  /** A consumer owns the selection visual (a markup tool draws its own preview). */
  readonly highlightHidden: boolean;
  /** A selection gesture is in flight (pointer-down … pointer-up). */
  readonly gestureActive: boolean;
}

export const initialSelectionState = (): SelectionState => ({
  selection: null,
  segments: {},
  highlightHidden: false,
  gestureActive: false,
});

const samePosition = (left: GlyphPosition, right: GlyphPosition): boolean =>
  left.glyph === right.glyph && left.page.pageObjectNumber === right.page.pageObjectNumber;

const sameRange = (left: SelectionRange | null, right: SelectionRange | null): boolean =>
  left === right ||
  (left !== null &&
    right !== null &&
    samePosition(left.anchor, right.anchor) &&
    samePosition(left.focus, right.focus));

const sameQuad = (left: TextQuad, right: TextQuad): boolean =>
  (['upperStart', 'upperEnd', 'lowerStart', 'lowerEnd'] as const).every(
    (corner) => left[corner].x === right[corner].x && left[corner].y === right[corner].y,
  );

const sameSegments = (
  left: readonly SelectionSegment[],
  right: readonly SelectionSegment[],
): boolean =>
  left === right ||
  (left.length === right.length &&
    left.every(
      (segment, index) =>
        segment.advance === right[index].advance && sameQuad(segment.quad, right[index].quad),
    ));

/**
 * Replace the range and its segments. A page whose segments are unchanged
 * keeps its previous array, so per-page reads stay reference-stable, and a
 * recompute that changes nothing returns the same state.
 */
export function setSelection(
  state: SelectionState,
  selection: SelectionRange,
  segments: SegmentsByPage,
): SelectionState {
  const pages = Object.keys(segments).map(Number);
  let segmentsChanged = pages.length !== Object.keys(state.segments).length;
  const merged: Record<PageObjectNumber, readonly SelectionSegment[]> = {};
  for (const pageObjectNumber of pages) {
    const previous = state.segments[pageObjectNumber];
    const next = segments[pageObjectNumber];
    if (previous && sameSegments(previous, next)) {
      merged[pageObjectNumber] = previous;
    } else {
      merged[pageObjectNumber] = next;
      segmentsChanged = true;
    }
  }
  const rangeChanged = !sameRange(state.selection, selection);
  if (!rangeChanged && !segmentsChanged) return state;
  return {
    ...state,
    selection: rangeChanged ? selection : state.selection,
    segments: segmentsChanged ? merged : state.segments,
  };
}

export function clearSelection(state: SelectionState): SelectionState {
  return state.selection === null && Object.keys(state.segments).length === 0
    ? state
    : { ...state, selection: null, segments: {} };
}

export const setHighlightHidden = (state: SelectionState, hidden: boolean): SelectionState =>
  state.highlightHidden === hidden ? state : { ...state, highlightHidden: hidden };

export const setGestureActive = (state: SelectionState, active: boolean): SelectionState =>
  state.gestureActive === active ? state : { ...state, gestureActive: active };

/**
 * The pages whose content (and so character space) a confirmed event
 * changed: applied redactions, flattened pages, and pages an annotation
 * flatten painted into (a free-text note becomes page text). Null for every
 * other event.
 */
export function contentChangedPagesOf(event: DocumentEvent): readonly PageRef[] | null {
  if (event.type === 'annotations.flattened') {
    return event.results.some((result) => result.status === 'applied') ? [event.page] : null;
  }
  if (event.type !== 'redaction.applied' && event.type !== 'pages.flattened') return null;
  const pages = event.results
    .filter((result) => result.status === 'applied')
    .map((result) => result.page);
  return pages.length > 0 ? pages : null;
}
