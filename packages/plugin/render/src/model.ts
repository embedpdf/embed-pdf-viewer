/**
 * The render ledger: per-page raster versions. Every function below is a
 * pure transition or projection; the controller applies the transitions with
 * `ctx.state.update`.
 */
import type { PageObjectNumber } from '@embedpdf/core';
import type { InvalidateScope } from './contract';

/**
 * Per-page versions of the two raster products a page has: base
 * (`includeAnnotations: false`) and annotated. Fed by the document event
 * stream and by the `invalidate` verb: a confirmed pixel-changing fact, own
 * or remote, bumps the touched pages, and anything holding a rendered
 * bitmap refetches. The versions are part of every raster and tile key.
 */
export interface RenderState {
  /** Base-raster versions, bumped by content facts (redaction, text edit). */
  readonly contentEpochs: Readonly<Record<PageObjectNumber, number>>;
  /** Appearance versions, bumped by annotation facts (annotations, form widgets). */
  readonly annotatedEpochs: Readonly<Record<PageObjectNumber, number>>;
}

export const initialRenderState = (): RenderState => ({
  contentEpochs: {},
  annotatedEpochs: {},
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
 * bumps only the content ledger; annotated readers sum both (see
 * {@link renderEpochOf}), which is how content invalidation reaches them too.
 */
export function invalidatePages(
  state: RenderState,
  pageObjectNumbers: readonly PageObjectNumber[],
  scope: InvalidateScope,
): RenderState {
  if (pageObjectNumbers.length === 0) return state;
  return scope === 'content'
    ? { ...state, contentEpochs: bump(state.contentEpochs, pageObjectNumbers) }
    : { ...state, annotatedEpochs: bump(state.annotatedEpochs, pageObjectNumbers) };
}

/** The version of one raster product of a page: content, plus annotations when they are baked in. */
export function renderEpochOf(
  state: RenderState,
  pageObjectNumber: PageObjectNumber,
  includeAnnotations: boolean,
): number {
  const content = state.contentEpochs[pageObjectNumber] ?? 0;
  return includeAnnotations ? content + (state.annotatedEpochs[pageObjectNumber] ?? 0) : content;
}
