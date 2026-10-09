/**
 * The render ledger: per-page raster versions. Every function below is a
 * pure transition or projection; the controller applies the transitions with
 * `ctx.state.update`.
 */
import type { PageObjectNumber, PageRenderLayers } from '@embedpdf/core';
import type { InvalidateScope } from './contract';

/**
 * Per-page versions of what a page picture can draw: the page content, its
 * annotations and its form fields. Fed by the document event stream and by
 * the `invalidate` verb: a confirmed pixel-changing fact, own or remote,
 * bumps the touched pages, and anything holding a rendered bitmap refetches.
 * A picture's version is the sum of the parts it draws, and is part of every
 * raster and tile key.
 */
export interface RenderState {
  /** Content versions, bumped by content facts (redaction, flatten). */
  readonly contentEpochs: Readonly<Record<PageObjectNumber, number>>;
  /** Annotation versions, bumped by annotation facts (widgets excepted). */
  readonly annotationEpochs: Readonly<Record<PageObjectNumber, number>>;
  /** Form field versions, bumped by form facts: a fill, a widget's move or look, a signing. */
  readonly fieldEpochs: Readonly<Record<PageObjectNumber, number>>;
}

export const initialRenderState = (): RenderState => ({
  contentEpochs: {},
  annotationEpochs: {},
  fieldEpochs: {},
});

const bump = (
  epochs: Readonly<Record<PageObjectNumber, number>>,
  pageObjectNumbers: readonly PageObjectNumber[],
): Record<PageObjectNumber, number> => {
  const next: Record<PageObjectNumber, number> = { ...epochs };
  for (const pageObjectNumber of pageObjectNumbers) {
    next[pageObjectNumber] = (next[pageObjectNumber] ?? 0) + 1;
  }
  return next;
};

/**
 * Bump the pages' versions in the ledger the scope names. A content fact
 * bumps only the content ledger; every picture counts content (see
 * {@link renderEpochOf}), which is how content invalidation reaches them all.
 */
export function invalidatePages(
  state: RenderState,
  pageObjectNumbers: readonly PageObjectNumber[],
  scope: InvalidateScope,
): RenderState {
  if (pageObjectNumbers.length === 0) return state;
  switch (scope) {
    case 'content':
      return { ...state, contentEpochs: bump(state.contentEpochs, pageObjectNumbers) };
    case 'annotations':
      return { ...state, annotationEpochs: bump(state.annotationEpochs, pageObjectNumbers) };
    case 'fields':
      return { ...state, fieldEpochs: bump(state.fieldEpochs, pageObjectNumbers) };
  }
}

/** The version of one picture of a page: its content, plus the annotations and form fields it draws. */
export function renderEpochOf(
  state: RenderState,
  pageObjectNumber: PageObjectNumber,
  layers: PageRenderLayers,
): number {
  return (
    (state.contentEpochs[pageObjectNumber] ?? 0) +
    (layers.includeAnnotations ? (state.annotationEpochs[pageObjectNumber] ?? 0) : 0) +
    (layers.includeFormFields ? (state.fieldEpochs[pageObjectNumber] ?? 0) : 0)
  );
}

/** The version of a page's form field pictures (its widgets' looks). */
export function fieldEpochOf(state: RenderState, pageObjectNumber: PageObjectNumber): number {
  return state.fieldEpochs[pageObjectNumber] ?? 0;
}

/** What a picture draws, as one key part: `a1f0` draws annotations and no form fields. */
export const layersKeyOf = (layers: PageRenderLayers): string =>
  `a${layers.includeAnnotations ? 1 : 0}f${layers.includeFormFields ? 1 : 0}`;
