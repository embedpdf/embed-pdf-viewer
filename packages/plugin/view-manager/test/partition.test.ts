import { describe, expect, it } from 'vitest';

import { addDocument, createPane, initialViewManagerState } from '../src/model';

describe('view-manager partition', () => {
  it('moves a document that another pane already holds instead of duplicating it', () => {
    let state = createPane(createPane(initialViewManagerState()));
    state = addDocument(state, 'pane-1', 'doc');
    state = addDocument(state, 'pane-2', 'doc');
    expect(state.panes['pane-1'].documentIds).toEqual([]);
    expect(state.panes['pane-2'].documentIds).toEqual(['doc']);
    expect(state.panes['pane-1'].activeDocumentId).toBeNull();
    expect(state.panes['pane-2'].activeDocumentId).toBe('doc');
  });
});
