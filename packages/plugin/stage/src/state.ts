/**
 * The Stage page's State table as code: what `useStageState()` returns, and
 * the same fields in every other framework. A second view registered with its
 * own token reads the same fields through its own capability.
 */
import { defineState } from '@embedpdf/core';

import { StageToken, ZoomMode } from './contract';

export const stageState = defineState(StageToken, {
  read: (stage) => ({
    zoomLevel: stage.getZoomLevel(),
    zoomMode: stage.getZoomMode(),
    currentPageIndex: stage.getCurrentPageIndex(),
    currentPage: stage.getCurrentPage(),
    pageCount: stage.getPageCount(),
    viewRotation: stage.getViewRotation(),
    activeRules: stage.listActiveRules(),
  }),
  empty: {
    zoomLevel: 1,
    zoomMode: ZoomMode.Automatic,
    currentPageIndex: 0,
    currentPage: null,
    pageCount: 0,
    viewRotation: 0,
    activeRules: [],
  },
});
