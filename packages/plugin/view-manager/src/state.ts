/**
 * The Several documents page's view-manager State table as code: what
 * `useViewManagerState()` returns, and the same fields in every other framework.
 */
import { defineState } from '@embedpdf/core';

import { ViewManagerToken, type PaneId, type PaneInfo } from './contract';

/** The panes, and the one new documents open in. */
export interface ViewManagerState {
  /** Every pane, in order. */
  readonly panes: readonly PaneInfo[];
  /** The pane new documents open in, or `null`. */
  readonly focusedPaneId: PaneId | null;
}

export const viewManagerState = defineState(ViewManagerToken, {
  read: (viewManager): ViewManagerState => ({
    panes: viewManager.listPanes(),
    focusedPaneId: viewManager.getFocusedPaneId(),
  }),
  empty: { panes: [], focusedPaneId: null },
});
