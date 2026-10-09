import { describe, expect, it } from 'vitest';

import { initialRenderState, invalidatePages, renderEpochOf } from '../src/model';

const PAGE = { includeAnnotations: false, includeFormFields: false };
const ANNOTATIONS = { includeAnnotations: true, includeFormFields: false };
const FIELDS = { includeAnnotations: false, includeFormFields: true };
const ALL = { includeAnnotations: true, includeFormFields: true };

describe('model', () => {
  it('invalidatePages bumps each touched page independently, in the ledger the scope names', () => {
    let state = initialRenderState();
    state = invalidatePages(state, [11], 'annotations');
    state = invalidatePages(state, [11, 22], 'annotations');
    state = invalidatePages(state, [11], 'content');
    state = invalidatePages(state, [22], 'fields');
    expect(state.annotationEpochs[11]).toBe(2);
    expect(state.annotationEpochs[22]).toBe(1);
    expect(state.contentEpochs[11]).toBe(1);
    expect(state.contentEpochs[22]).toBeUndefined();
    expect(state.fieldEpochs[22]).toBe(1);
  });

  it('invalidatePages returns the same state for an empty page list', () => {
    const state = initialRenderState();
    expect(invalidatePages(state, [], 'content')).toBe(state);
  });

  it('renderEpochOf counts content, plus the annotations and form fields the picture draws', () => {
    let state = invalidatePages(initialRenderState(), [11], 'content');
    state = invalidatePages(state, [11, 11], 'annotations');
    state = invalidatePages(state, [11, 11, 11], 'fields');
    expect(renderEpochOf(state, 11, PAGE)).toBe(1);
    expect(renderEpochOf(state, 11, ANNOTATIONS)).toBe(3);
    expect(renderEpochOf(state, 11, FIELDS)).toBe(4);
    expect(renderEpochOf(state, 11, ALL)).toBe(6);
    expect(renderEpochOf(state, 22, ALL)).toBe(0);
  });
});
