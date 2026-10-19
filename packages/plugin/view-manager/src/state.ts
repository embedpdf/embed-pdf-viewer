/**
 * The Several documents page's view-manager State table as code: what
 * `useViewManagerState()` returns, and the same fields in every other framework.
 */
import { defineState } from '@embedpdf/core';

import { ViewManagerToken } from './contract';

export const viewManagerState = defineState(ViewManagerToken, {
  read: (viewManager) => ({
    panes: viewManager.listPanes(),
    focusedPaneId: viewManager.getFocusedPaneId(),
  }),
  empty: { panes: [], focusedPaneId: null },
});
