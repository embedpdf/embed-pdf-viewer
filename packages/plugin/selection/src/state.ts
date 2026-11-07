/**
 * The selection page's State table as code: what `useSelectionState()`
 * returns, and the same fields in every other framework. The geometry is not
 * here: a layer reads its page's segments with `listSegments(page)`, so a
 * toolbar that only shows whether something is selected doesn't re-render for
 * every step of a drag.
 */
import { defineState, type PageRef } from '@embedpdf/core';

import { SelectionToken, type TextRange } from './contract';

/** Whether text is selected or being selected, the range, and the pages it covers. */
export interface SelectionState {
  /** Whether anything is selected. */
  readonly hasSelection: boolean;
  /** Whether the user is still selecting: from the press of a drag, a double-click or a handle until it lifts. */
  readonly isSelecting: boolean;
  /** The selected character range, or `null`. */
  readonly range: TextRange | null;
  /** The pages the selection covers, in document order. */
  readonly pages: readonly PageRef[];
}

export const selectionState = defineState(SelectionToken, {
  read: (selection): SelectionState => ({
    hasSelection: selection.hasSelection(),
    isSelecting: selection.isSelecting(),
    range: selection.getRange(),
    pages: selection.listSelectedPages(),
  }),
  empty: {
    hasSelection: false,
    isSelecting: false,
    range: null,
    pages: [],
  },
});
