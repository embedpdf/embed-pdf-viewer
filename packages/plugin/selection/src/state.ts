/**
 * The selection page's State table as code: what `useSelectionState()`
 * returns, and the same fields in every other framework. The geometry is not
 * here: a layer reads its page's segments with `listSegments(page)`, so a
 * toolbar that only shows whether something is selected doesn't re-render for
 * every step of a drag.
 */
import { defineState } from '@embedpdf/core';

import { SelectionToken } from './contract';

export const selectionState = defineState(SelectionToken, {
  read: (selection) => ({
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
