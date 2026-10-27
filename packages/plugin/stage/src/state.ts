/**
 * The Stage page's State table as code: what `useStageState()` returns, and
 * the same fields in every other framework. A second view registered with its
 * own token reads the same fields through its own capability.
 */
import { defineState, type PageRef } from '@embedpdf/core';
import type { PageRotation } from '@embedpdf/core-geometry';
import type { ZoomModeValue } from '@embedpdf/core-stage';

import { StageToken, ZoomMode } from './contract';

/** The zoom, the current page, how many pages, the view's rotation, and the responsive rules that match. */
export interface StageState {
  /** The resolved zoom factor. */
  readonly zoomLevel: number;
  /** The zoom intent: a fit mode, or `'custom'` for a fixed level. */
  readonly zoomMode: ZoomModeValue | 'custom';
  /** The current page's display index, from 0. */
  readonly currentPageIndex: number;
  /** The current page, or `null` before the document has pages. */
  readonly currentPage: PageRef | null;
  /** How many pages the document has. */
  readonly pageCount: number;
  /** The view's clockwise rotation, on top of each page's own; never written to the document. */
  readonly viewRotation: PageRotation;
  /** The names of the responsive rules matching the current box, in source order. */
  readonly activeRules: readonly string[];
}

export const stageState = defineState(StageToken, {
  read: (stage): StageState => ({
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
