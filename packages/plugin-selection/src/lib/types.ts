import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { PdfPageGeometry, PdfTask, Rect } from '@embedpdf/models';

export interface SelectionPluginConfig extends BasePluginConfig {}

/* ---- user-selection cross-page -------------------------------------- */
export interface GlyphPointer {
  page: number;
  index: number; // glyph index within that page
}

export interface SelectionRangeX {
  start: GlyphPointer;
  end: GlyphPointer; // inclusive
}

export interface SelectionState {
  /** page → geometry cache */
  geometry: Record<number, PdfPageGeometry>;
  /** current selection or null */
  rects: Record<number, Rect[]>;
  selection: SelectionRangeX | null;
  slices: Record<number, { start: number; count: number }>;
  active: boolean;
  selecting: boolean;
}

export interface FormattedSelection {
  pageIndex: number;
  rect: Rect;
  segmentRects: Rect[];
}

export interface SelectionRectsCallback {
  rects: Rect[];
  boundingRect: Rect | null;
}

export interface RegisterSelectionOnPageOptions {
  pageIndex: number;
  onRectsChange: (data: SelectionRectsCallback) => void;
}

export interface SelectionCapability {
  /* geometry (cached) */
  getGeometry(page: number): PdfTask<PdfPageGeometry>;
  /* formatted selection for all pages */
  getFormattedSelection(): FormattedSelection[];
  /* formatted selection for one page */
  getFormattedSelectionForPage(page: number): FormattedSelection | null;
  /* highlight rectangles for one page */
  getHighlightRectsForPage(page: number): Rect[];
  /* highlight rectangles for all pages */
  getHighlightRects(): Record<number, Rect[]>;
  /* bounding rectangles for all pages */
  getBoundingRectForPage(page: number): Rect | null;
  /* bounding rectangles for all pages */
  getBoundingRects(): { page: number; rect: Rect }[];
  /* get selected text */
  getSelectedText(): PdfTask<string[]>;
  /* copy selected text to clipboard */
  copyToClipboard(): void;
  /* imperative API used by framework layers */
  begin(page: number, glyphIdx: number): void;
  update(page: number, glyphIdx: number): void;
  end(): void;
  clear(): void;
  onSelectionChange: EventHook<SelectionRangeX | null>;
  onTextRetrieved: EventHook<string[]>;
  onCopyToClipboard: EventHook<string>;
  onBeginSelection: EventHook<{ page: number; index: number }>;
  onEndSelection: EventHook<void>;
  /** Tell the selection plugin that text selection should stay
      enabled while <modeId> is active.                    */
  enableForMode(modeId: string): void;
  /** Quick check used by SelectionLayer during pointer events. */
  isEnabledForMode(modeId: string): boolean;
  /** Get the current state of the selection plugin. */
  getState(): SelectionState;
  /** Register selection handlers for a specific page */
  registerSelectionOnPage: (opts: RegisterSelectionOnPageOptions) => () => void;
}
