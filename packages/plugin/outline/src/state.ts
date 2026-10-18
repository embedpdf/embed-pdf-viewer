/**
 * The outline page's State table as code: what `useOutlineState()` returns,
 * and the same fields in every other framework. Reading the state loads the
 * outline (`ensure`): the first reader of a document starts the read.
 */
import { defineState } from '@embedpdf/core';

import { OutlineToken } from './contract';

export const outlineState = defineState(OutlineToken, {
  read: (outline) => ({
    items: outline.list(),
    rows: outline.listRows(),
    current: outline.getCurrentItem(),
    selected: outline.getSelected(),
    status: outline.getStatus(),
    incomplete: outline.isIncomplete(),
    canEdit: outline.canEdit(),
  }),
  empty: {
    items: [],
    rows: [],
    current: null,
    selected: [],
    status: 'idle',
    incomplete: false,
    canEdit: false,
  },
  ensure: (outline) => outline.ensureLoaded(),
});
