import { describe, expect, it } from 'vitest';
import { initialViewManagerState, viewManagerReducer } from '../src/model';

/** G12: a document belongs to exactly one pane; ADD_DOC into a second pane moves it. */
describe('view-manager partition invariant', () => {
  it('moves a document that another pane already holds instead of duplicating it', () => {
    let state = initialViewManagerState();
    state = viewManagerReducer(state, {
      type: 'CREATE_PANE',
      pane: { id: 'a', documentIds: [], activeDocumentId: null },
    });
    state = viewManagerReducer(state, {
      type: 'CREATE_PANE',
      pane: { id: 'b', documentIds: [], activeDocumentId: null },
    });
    state = viewManagerReducer(state, { type: 'ADD_DOC', paneId: 'a', documentId: 'doc' });
    state = viewManagerReducer(state, { type: 'ADD_DOC', paneId: 'b', documentId: 'doc' });
    expect(state.panes.a.documentIds).toEqual([]);
    expect(state.panes.b.documentIds).toEqual(['doc']);
    expect(state.panes.a.activeDocumentId).toBeNull();
    expect(state.panes.b.activeDocumentId).toBe('doc');
  });
});
