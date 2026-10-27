/**
 * The history page's State table as code: what `useHistoryState()` returns,
 * and the same fields in every other framework. What the undo and redo
 * buttons read.
 */
import { defineState, type ChangeLabel } from '@embedpdf/core';

import { HistoryToken } from './contract';

/** Whether undo and redo can run, and what each would change. */
export interface HistoryState {
  /** Whether there is a change to undo. */
  readonly canUndo: boolean;
  /** Whether there is an undone change to redo. */
  readonly canRedo: boolean;
  /** What undo would undo, for a tooltip ("Undo move of 3 annotations"), or `null`. */
  readonly undoLabel: ChangeLabel | null;
  /** What redo would redo, or `null`. */
  readonly redoLabel: ChangeLabel | null;
}

export const historyState = defineState(HistoryToken, {
  read: (history): HistoryState => ({
    canUndo: history.canUndo(),
    canRedo: history.canRedo(),
    undoLabel: history.getUndoLabel(),
    redoLabel: history.getRedoLabel(),
  }),
  empty: {
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
  },
});
