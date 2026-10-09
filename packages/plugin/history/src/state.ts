/**
 * The history page's State table as code: what `useHistoryState()` returns,
 * and the same fields in every other framework. What the undo and redo
 * buttons read.
 */
import { defineState } from '@embedpdf/core';

import { HistoryToken } from './contract';

export const historyState = defineState(HistoryToken, {
  read: (history) => ({
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
