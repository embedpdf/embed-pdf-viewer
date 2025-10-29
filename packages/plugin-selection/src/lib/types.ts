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

export interface SelectionDocumentState {
  /** page → geometry cache */
  geometry: Record<number, PdfPageGeometry>;
  /** current selection or null */
  rects: Record<number, Rect[]>;
  selection: SelectionRangeX | null;
  slices: Record<number, { start: number; count: number }>;
  active: boolean;
  selecting: boolean;
}

export interface SelectionState {
  documents: Record<string, SelectionDocumentState>;
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
  documentId: string;
  pageIndex: number;
  onRectsChange: (data: SelectionRectsCallback) => void;
}

// ─────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────

export interface SelectionChangeEvent {
  documentId: string;
  selection: SelectionRangeX | null;
}

export interface TextRetrievedEvent {
  documentId: string;
  text: string[];
}

export interface CopyToClipboardEvent {
  documentId: string;
  text: string;
}

export interface BeginSelectionEvent {
  documentId: string;
  page: number;
  index: number;
}

export interface EndSelectionEvent {
  documentId: string;
}

// ─────────────────────────────────────────────────────────
// Capability
// ─────────────────────────────────────────────────────────

export interface SelectionScope {
  getFormattedSelection(): FormattedSelection[];
  getFormattedSelectionForPage(page: number): FormattedSelection | null;
  getHighlightRectsForPage(page: number): Rect[];
  getHighlightRects(): Record<number, Rect[]>;
  getBoundingRectForPage(page: number): Rect | null;
  getBoundingRects(): { page: number; rect: Rect }[];
  getSelectedText(): PdfTask<string[]>;
  clear(): void;
  copyToClipboard(): void;
  getState(): SelectionDocumentState;
  onSelectionChange: EventHook<SelectionRangeX | null>;
  onTextRetrieved: EventHook<string[]>;
  onCopyToClipboard: EventHook<string>;
  onBeginSelection: EventHook<{ page: number; index: number }>;
  onEndSelection: EventHook<void>;
}

export interface SelectionCapability {
  // Active document operations
  getFormattedSelection(documentId?: string): FormattedSelection[];
  getFormattedSelectionForPage(page: number, documentId?: string): FormattedSelection | null;
  getHighlightRectsForPage(page: number, documentId?: string): Rect[];
  getHighlightRects(documentId?: string): Record<number, Rect[]>;
  getBoundingRectForPage(page: number, documentId?: string): Rect | null;
  getBoundingRects(documentId?: string): { page: number; rect: Rect }[];
  getSelectedText(documentId?: string): PdfTask<string[]>;
  clear(documentId?: string): void;
  copyToClipboard(documentId?: string): void;
  getState(documentId?: string): SelectionDocumentState;
  enableForMode(modeId: string, documentId?: string): void;
  isEnabledForMode(modeId: string, documentId?: string): boolean;

  // Document-scoped operations
  forDocument(documentId: string): SelectionScope;

  // Global events (include documentId)
  onSelectionChange: EventHook<SelectionChangeEvent>;
  onTextRetrieved: EventHook<TextRetrievedEvent>;
  onCopyToClipboard: EventHook<CopyToClipboardEvent>;
  onBeginSelection: EventHook<BeginSelectionEvent>;
  onEndSelection: EventHook<EndSelectionEvent>;
}
