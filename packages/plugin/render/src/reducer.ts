import type { RenderAction, RenderState } from './types';

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

/** Pure. Two transitions: bump the touched pages' ledger for the fact's
 *  scope (one action per fact, so a batch result bumps each pon once — a
 *  'content' fact bumps ONLY the content ledger; annotated readers sum both,
 *  which is how content invalidation reaches them too), and the tile
 *  wake-up counter. The render POLICY is deliberately NOT here — it's a
 *  document fact on `DocumentMeta`, materialized by the kernel at open. */
export const renderReducer = (state: RenderState, a: RenderAction): RenderState => {
  if (a.type === 'PAINT_ADVANCED') {
    // A tile resolution/paint advanced the (store-external) tile state —
    // this bump only wakes subscribed layers to recompute `tilePlan`.
    return { ...state, paintVersions: bump(state.paintVersions, [a.pon]) };
  }
  if (a.type !== 'INVALIDATE' || a.pons.length === 0) return state;
  return a.scope === 'content'
    ? { ...state, contentEpochs: bump(state.contentEpochs, a.pons) }
    : { ...state, annotatedEpochs: bump(state.annotatedEpochs, a.pons) };
};
