/**
 * @embedpdf/svelte/history — undo and redo of what you change through the viewer, one history
 * per open document. An action shows undone at once, even while it is still on its way:
 *
 *   const history = useHistory();
 *   const state = useHistoryState(); // state.canUndo, state.undoLabel, …
 *   <button disabled={!state.canUndo} onclick={() => history.undo()}>Undo</button>
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-history';

export { useHistory, useHistoryEvent, useHistoryState } from './history/readers';
