import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { PdfPageGeometry, PdfTask, Rect, Size } from '@embedpdf/models';

export interface MarqueeSelectionConfig {
  /** Minimum drag distance in pixels before considering it a marquee */
  minDragPx?: number;
  /** Whether marquee selection is enabled (default: true) */
  enabled?: boolean;
}

export interface SelectionPluginConfig extends BasePluginConfig {
  /**
   * The approximate height of the selection menu in pixels.
   * Used to determine whether to show the menu above or below the selection.
   * @default 40
   */
  menuHeight?: number;
  /**
   * Configuration for marquee selection behavior.
   */
  marquee?: MarqueeSelectionConfig;
}

export interface SelectionMenuPlacement {
  pageIndex: number; // The page the menu is anchored to
  rect: Rect; // The viewport-relative rect to position against
  spaceAbove: number;
  spaceBelow: number;
  suggestTop: boolean; // The plugin's suggestion
  isVisible: boolean; // Is the anchor rect even in the viewport?
}

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

export interface RegisterMarqueeOnPageOptions {
  documentId: string;
  pageIndex: number;
  /** The page size (for marquee clamping) */
  pageSize: Size;
  /** The current scale factor (for marquee threshold calculation) */
  scale: number;
  /** Called when the marquee rect changes during drag, or null when cancelled/ended */
  onRectChange: (rect: Rect | null) => void;
}

// ─────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────

export interface SelectionMenuPlacementEvent {
  documentId: string;
  placement: SelectionMenuPlacement | null;
}

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

export interface MarqueeChangeEvent {
  documentId: string;
  pageIndex: number;
  rect: Rect | null; // null when cancelled/ended
}

export interface MarqueeEndEvent {
  documentId: string;
  pageIndex: number;
  rect: Rect;
}

// ─────────────────────────────────────────────────────────
// Mode Configuration
// ─────────────────────────────────────────────────────────

export interface EnableForModeOptions {
  /**
   * Whether to show selection rects in the SelectionLayer.
   * When false, the selection logic is enabled but the rects are not
   * rendered (useful when a consuming plugin handles its own rendering).
   * @default true
   */
  showRects?: boolean;
}

// ─────────────────────────────────────────────────────────
// Capability
// ─────────────────────────────────────────────────────────

export interface MarqueeScopeEvent {
  pageIndex: number;
  rect: Rect | null;
}

export interface MarqueeEndScopeEvent {
  pageIndex: number;
  rect: Rect;
}

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
  setMarqueeEnabled(enabled: boolean): void;
  isMarqueeEnabled(): boolean;
  onSelectionChange: EventHook<SelectionRangeX | null>;
  onTextRetrieved: EventHook<string[]>;
  onCopyToClipboard: EventHook<string>;
  onBeginSelection: EventHook<{ page: number; index: number }>;
  onEndSelection: EventHook<void>;
  onMarqueeChange: EventHook<MarqueeScopeEvent>;
  onMarqueeEnd: EventHook<MarqueeEndScopeEvent>;
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
  enableForMode(modeId: string, options?: EnableForModeOptions, documentId?: string): void;
  isEnabledForMode(modeId: string, documentId?: string): boolean;

  // Marquee selection
  setMarqueeEnabled(enabled: boolean, documentId?: string): void;
  isMarqueeEnabled(documentId?: string): boolean;

  // Document-scoped operations
  forDocument(documentId: string): SelectionScope;

  // Global events (include documentId)
  onSelectionChange: EventHook<SelectionChangeEvent>;
  onTextRetrieved: EventHook<TextRetrievedEvent>;
  onCopyToClipboard: EventHook<CopyToClipboardEvent>;
  onBeginSelection: EventHook<BeginSelectionEvent>;
  onEndSelection: EventHook<EndSelectionEvent>;

  // Marquee selection events
  onMarqueeChange: EventHook<MarqueeChangeEvent>;
  onMarqueeEnd: EventHook<MarqueeEndEvent>;
}
