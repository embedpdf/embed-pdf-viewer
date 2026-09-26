/** The render ledger: per-page raster versions and the tile wake-up counter. */
import type { PageObjectNumber } from '@embedpdf/core';
import type { InvalidateScope } from './contract';

/**
 * Per-page versions of the two raster products a page has — base
 * (`includeAnnotations: false`) and annotated. Fed by the document event
 * stream and by the `invalidate` verb: a confirmed pixel-changing fact — own
 * or remote — bumps the touched pages, and anything holding a rendered
 * bitmap refetches.
 */
export interface RenderState {
  /** Base-raster versions — bumped by CONTENT facts (redaction, text edit). */
  readonly contentEpochs: Readonly<Record<PageObjectNumber, number>>;
  /** Appearance versions — bumped by ANNOTATION facts (annotations, form widgets). */
  readonly annotatedEpochs: Readonly<Record<PageObjectNumber, number>>;
  /**
   * Tile paint-plan wake-ups. The tile manager's state lives OUTSIDE the
   * store — it holds live handles and abort controllers — so re-plans bump
   * this counter to make subscribed layers read `getPlan` again. The value
   * itself carries no meaning.
   */
  readonly paintVersions: Readonly<Record<PageObjectNumber, number>>;
}

export type RenderAction =
  | { type: 'invalidate'; scope: InvalidateScope; pages: readonly PageObjectNumber[] }
  | { type: 'paintAdvanced'; page: PageObjectNumber };

export const initialRenderState = (): RenderState => ({
  contentEpochs: {},
  annotatedEpochs: {},
  paintVersions: {},
});

const bump = (
  epochs: Readonly<Record<number, number>>,
  pons: readonly number[],
): Record<number, number> => {
  const next: Record<number, number> = { ...epochs };
  for (const pon of pons) next[pon] = (next[pon] ?? 0) + 1;
  return next;
};

/** Pure. A 'content' fact bumps ONLY the content ledger; annotated readers
 *  sum both, which is how content invalidation reaches them too. */
export function reduceRender(state: RenderState, action: RenderAction): RenderState {
  if (action.type === 'paintAdvanced') {
    return { ...state, paintVersions: bump(state.paintVersions, [action.page]) };
  }
  if (action.type !== 'invalidate' || action.pages.length === 0) return state;
  return action.scope === 'content'
    ? { ...state, contentEpochs: bump(state.contentEpochs, action.pages) }
    : { ...state, annotatedEpochs: bump(state.annotatedEpochs, action.pages) };
}
