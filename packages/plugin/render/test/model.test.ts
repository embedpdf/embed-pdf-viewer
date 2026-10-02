import { describe, expect, it } from 'vitest';

import { initialRenderState, invalidatePages, renderEpochOf } from '../src/model';

describe('model', () => {
  it('invalidatePages bumps each touched page independently, in the ledger the scope names', () => {
    let state = initialRenderState();
    state = invalidatePages(state, [11], 'annotations');
    state = invalidatePages(state, [11, 22], 'annotations');
    state = invalidatePages(state, [11], 'content');
    expect(state.annotatedEpochs[11]).toBe(2);
    expect(state.annotatedEpochs[22]).toBe(1);
    expect(state.contentEpochs[11]).toBe(1);
    expect(state.contentEpochs[22]).toBeUndefined();
  });

  it('invalidatePages returns the same state for an empty page list', () => {
    const state = initialRenderState();
    expect(invalidatePages(state, [], 'content')).toBe(state);
  });

  it('renderEpochOf sums both ledgers for annotated rasters and only content for base rasters', () => {
    let state = invalidatePages(initialRenderState(), [11], 'content');
    state = invalidatePages(state, [11, 11], 'annotations');
    expect(renderEpochOf(state, 11, false)).toBe(1);
    expect(renderEpochOf(state, 11, true)).toBe(3);
    expect(renderEpochOf(state, 22, true)).toBe(0);
  });
});
