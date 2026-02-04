import { Rect, boundingRect } from '@embedpdf/models';
import { FormattedSelection, SelectionDocumentState } from './types';

export function selectRectsForPage(state: SelectionDocumentState, page: number) {
  return state.rects[page] ?? [];
}

export function selectBoundingRectForPage(state: SelectionDocumentState, page: number) {
  return boundingRect(selectRectsForPage(state, page));
}

export function selectRectsAndBoundingRectForPage(state: SelectionDocumentState, page: number) {
  return {
    rects: selectRectsForPage(state, page),
    boundingRect: selectBoundingRectForPage(state, page),
  };
}

export function selectBoundingRectsForAllPages(state: SelectionDocumentState) {
  const out: { page: number; rect: Rect }[] = [];
  const rectMap = state.rects;

  for (const key in rectMap) {
    const page = Number(key);
    const bRect = boundingRect(rectMap[page]);
    if (bRect) out.push({ page, rect: bRect });
  }
  return out;
}

export function getFormattedSelectionForPage(
  state: SelectionDocumentState,
  page: number,
): FormattedSelection | null {
  const segmentRects = state.rects[page] || [];
  if (segmentRects.length === 0) return null;
  const boundingRect = selectBoundingRectForPage(state, page);
  if (!boundingRect) return null;
  return { pageIndex: page, rect: boundingRect, segmentRects };
}

export function getFormattedSelection(state: SelectionDocumentState) {
  const result: FormattedSelection[] = [];

  // Get all pages that have rects
  const pages = Object.keys(state.rects).map(Number);

  for (const pageIndex of pages) {
    const segmentRects = state.rects[pageIndex] || [];

    if (segmentRects.length === 0) continue;

    // Calculate bounding rect for this page
    const boundingRect = selectBoundingRectForPage(state, pageIndex);

    if (boundingRect) {
      result.push({
        pageIndex,
        rect: boundingRect,
        segmentRects,
      });
    }
  }

  return result;
}
