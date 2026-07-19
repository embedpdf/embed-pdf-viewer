import type { RenderAction, RenderState } from './types';

export const initialRenderState = (): RenderState => ({
  contentEpochs: {},
  annotatedEpochs: {},
});

const bump = (
  epochs: Readonly<Record<number, number>>,
  pons: readonly number[],
): Record<number, number> => {
  const next: Record<number, number> = { ...epochs };
  for (const pon of pons) next[pon] = (next[pon] ?? 0) + 1;
  return next;
};

/** Pure. The only transition: bump the touched pages' ledger for the fact's
 *  scope (one action per fact, so a batch result bumps each pon once). A
 *  'content' fact bumps ONLY the content ledger — annotated readers sum both,
 *  which is how content invalidation reaches them too. */
export const renderReducer = (state: RenderState, a: RenderAction): RenderState => {
  if (a.type !== 'INVALIDATE' || a.pons.length === 0) return state;
  return a.scope === 'content'
    ? { ...state, contentEpochs: bump(state.contentEpochs, a.pons) }
    : { ...state, annotatedEpochs: bump(state.annotatedEpochs, a.pons) };
};
