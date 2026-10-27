/**
 * The outline page's State table as code: what `useOutlineState()` returns,
 * and the same fields in every other framework. Reading the state loads the
 * outline (`ensure`): the first reader of a document starts the read.
 */
import { defineState, type ResourceStatus } from '@embedpdf/core';
import type { OutlineItem, OutlineItemRef } from '@embedpdf/engine-core/runtime';

import { OutlineToken, type OutlineRow } from './contract';

/** The outline's items and rows, the current and selected items, and whether it's read and may change. */
export interface OutlineState {
  /** Every item, depth first, with this session's pending changes shown. Empty until the first read lands. */
  readonly items: readonly OutlineItem[];
  /** The rows a tree view shows: every item whose parents are all expanded, depth first, with its depth. */
  readonly rows: readonly OutlineRow[];
  /** The item for where the main view is reading, or `null`. */
  readonly current: OutlineItemRef | null;
  /** The selected items, in the order they were selected. */
  readonly selected: readonly OutlineItemRef[];
  /** `idle` until something reads the state, then `loading` and `ready`, or `forbidden` or `error`. */
  readonly status: ResourceStatus;
  /** Part of the outline couldn't be read (a loop in it, or past the read limits); the rest is listed. */
  readonly incomplete: boolean;
  /** Whether this session may change the outline (`doc.outline.modify`). */
  readonly canEdit: boolean;
}

export const outlineState = defineState(OutlineToken, {
  read: (outline): OutlineState => ({
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
