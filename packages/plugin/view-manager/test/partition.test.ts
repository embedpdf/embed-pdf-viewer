import { describe, expect, it } from 'vitest';
import { initialViewManagerState, viewManagerReducer } from '../src/reducer';

/** G12: a document belongs to exactly one pane; ADD_DOC into a second pane moves it. */
describe('view-manager partition invariant', () => {
  it('moves a document that another pane already holds instead of duplicating it', () => {
    let state = initialViewManagerState;
    state = viewManagerReducer(state, {
      type: 'CREATE',
      view: { id: 'a', documentIds: [], activeDocumentId: null },
    });
    state = viewManagerReducer(state, {
      type: 'CREATE',
      view: { id: 'b', documentIds: [], activeDocumentId: null },
    });
    state = viewManagerReducer(state, { type: 'ADD_DOC', viewId: 'a', documentId: 'doc' });
    state = viewManagerReducer(state, { type: 'ADD_DOC', viewId: 'b', documentId: 'doc' });
    expect(state.views.a.documentIds).toEqual([]);
    expect(state.views.b.documentIds).toEqual(['doc']);
    expect(state.views.a.activeDocumentId).toBeNull();
    expect(state.views.b.activeDocumentId).toBe('doc');
  });
});
