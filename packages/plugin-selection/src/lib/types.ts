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
  /**
   * Tolerance factor for hit-testing glyphs. Multiplied by average glyph
   * height to derive the tolerance radius. Set to 0 to require exact hits.
   * @default 1.5
   */
  toleranceFactor?: number;
  /**
   * Minimum drag distance (in page-coordinate units) the pointer must move
   * before a drag-selection starts. Prevents accidental selection on simple clicks.
   * @default 3
   */
  minSelectionDragDistance?: number;
  /**
   * Maximum number of pages whose geometry data is kept in memory per document.
   * Oldest unused pages are evicted when this limit is exceeded.
   * @default 50
   */
  maxCachedGeometries?: number;
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
  /** The current scale factor (for marquee threshold calculation) */
  scale: number;
  /** Called when the marquee rect changes during drag, or null when cancelled/ended */
  onRectChange: (rect: Rect | null) => void;
}

// ─────────────────────────────────────────────────────────
// Component Style Types
// ─────────────────────────────────────────────────────────

export interface TextSelectionStyle {
  /** Background color for text selection highlights. Default: 'rgba(33,150,243)' */
  background?: string;
}

export interface MarqueeSelectionStyle {
  /** Fill/background color inside the marquee rectangle. Default: 'rgba(0,122,204,0.15)' */
  background?: string;
  /** Border color of the marquee rectangle. Default: 'rgba(0,122,204,0.8)' */
  borderColor?: string;
  /** Border style. Default: 'dashed' */
  borderStyle?: 'solid' | 'dashed' | 'dotted';
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
  modeId: string;
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
  modeId: string;
}

export interface EndSelectionEvent {
  documentId: string;
  modeId: string;
}

export interface MarqueeChangeEvent {
  documentId: string;
  pageIndex: number;
  rect: Rect | null; // null when cancelled/ended
  modeId: string;
}

export interface MarqueeEndEvent {
  documentId: string;
  pageIndex: number;
  rect: Rect;
  modeId: string;
}

export interface EmptySpaceClickEvent {
  documentId: string;
  pageIndex: number;
  modeId: string;
}

// ─────────────────────────────────────────────────────────
// Mode Configuration
// ─────────────────────────────────────────────────────────

export interface EnableForModeOptions {
  /**
   * Whether to show selection rects in the SelectionLayer.
   * @deprecated Use `showSelectionRects` instead.
   * @default true
   */
  showRects?: boolean;
  /**
   * Enable text selection for this mode.
   * @default true
   */
  enableSelection?: boolean;
  /**
   * Whether to show text selection rects in the SelectionLayer.
   * When false, the selection logic is enabled but the rects are not
   * rendered (useful when a consuming plugin handles its own rendering).
   * Takes precedence over `showRects`.
   * @default true
   */
  showSelectionRects?: boolean;
  /**
   * Enable marquee selection for this mode.
   * @default false
   */
  enableMarquee?: boolean;
  /**
   * Whether to show the marquee rect in the MarqueeSelection component.
   * When false, the marquee logic runs but the rect is not rendered
   * (useful when a consuming plugin handles its own rendering).
   * @default true
   */
  showMarqueeRects?: boolean;
}

// ─────────────────────────────────────────────────────────
// Capability
// ─────────────────────────────────────────────────────────

export interface MarqueeScopeEvent {
  pageIndex: number;
  rect: Rect | null;
  modeId: string;
}

export interface MarqueeEndScopeEvent {
  pageIndex: number;
  rect: Rect;
  modeId: string;
}

export interface EmptySpaceClickScopeEvent {
  pageIndex: number;
  modeId: string;
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
  /**
   * @deprecated Use `enableForMode` with `enableMarquee` option on the capability instead.
   */
  setMarqueeEnabled(enabled: boolean): void;
  /**
   * @deprecated Use `enableForMode` / `isEnabledForMode` on the capability instead.
   */
  isMarqueeEnabled(): boolean;
  // TODO(next-major): change to EventHook<{ selection: SelectionRangeX | null; modeId: string }>
  onSelectionChange: EventHook<SelectionRangeX | null>;
  onTextRetrieved: EventHook<string[]>;
  onCopyToClipboard: EventHook<string>;
  onBeginSelection: EventHook<{ page: number; index: number; modeId: string }>;
  onEndSelection: EventHook<{ modeId: string }>;
  onMarqueeChange: EventHook<MarqueeScopeEvent>;
  onMarqueeEnd: EventHook<MarqueeEndScopeEvent>;
  onEmptySpaceClick: EventHook<EmptySpaceClickScopeEvent>;
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

  /**
   * @deprecated Use `enableForMode` with `enableMarquee` option instead.
   */
  setMarqueeEnabled(enabled: boolean, documentId?: string): void;
  /**
   * @deprecated Use `enableForMode` / `isEnabledForMode` instead.
   */
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

  // Empty space click event
  onEmptySpaceClick: EventHook<EmptySpaceClickEvent>;
}
