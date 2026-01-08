import { BasePluginConfig, EventHook } from '@embedpdf/core';
import {
  PdfTextBlock,
  Position,
  PdfTask,
  Rect,
  PdfLayoutSummary,
  PdfWord,
  PdfLine,
  PdfColumn,
  PdfTable,
  PdfTextBlockDetectionFlag,
  PdfLayoutDebugFlag,
} from '@embedpdf/models';

// ─────────────────────────────────────────────────────────
// Plugin Configuration
// ─────────────────────────────────────────────────────────

export interface EditPluginConfig extends BasePluginConfig {
  /**
   * Whether to automatically detect text blocks when a page is registered
   * @default true
   */
  autoDetect?: boolean;
  /**
   * Default detection flags to use
   * @default PdfTextBlockDetectionFlag.Default
   */
  detectionFlags?: PdfTextBlockDetectionFlag;
}

/**
 * Options for text block detection
 */
export interface DetectBlocksOptions {
  /** Detection flags (overrides config defaults) */
  flags?: PdfTextBlockDetectionFlag;
}

/**
 * Options for rendering debug overlay
 */
export interface RenderDebugOverlayOptions {
  scale: number;
  rotation?: number;
  /** Which debug elements to show */
  debugFlags?: PdfLayoutDebugFlag;
}

// ─────────────────────────────────────────────────────────
// State Types
// ─────────────────────────────────────────────────────────

export type DetectionStatus = 'idle' | 'detecting' | 'detected' | 'error';

export interface EditPageState {
  /** Current detection status for this page */
  detectionStatus: DetectionStatus;
  /** Detected text blocks (metadata only) */
  textBlocks: PdfTextBlock[];
  /** Index of the currently selected block, or null if none */
  selectedBlockIndex: number | null;
  /** Visual drag offsets for blocks (not persisted to PDF) */
  blockOffsets: Record<number, Position>;
  /** Layout summary (words, lines, columns, tables counts + adaptive params) */
  layoutSummary: PdfLayoutSummary | null;
  /** Detected words */
  words: PdfWord[];
  /** Detected lines */
  lines: PdfLine[];
  /** Detected columns */
  columns: PdfColumn[];
  /** Detected tables */
  tables: PdfTable[];
}

export interface EditDocumentState {
  /** Per-page edit state */
  pages: Record<number, EditPageState>;
}

export interface EditState {
  /** Per-document edit state */
  documents: Record<string, EditDocumentState>;
}

// ─────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────

export interface EditPageStateChangeEvent {
  documentId: string;
  pageIndex: number;
  state: EditPageState;
}

export interface BlockSelectedEvent {
  documentId: string;
  pageIndex: number;
  blockIndex: number | null;
  block: PdfTextBlock | null;
}

export interface BlockOffsetChangeEvent {
  documentId: string;
  pageIndex: number;
  blockIndex: number;
  offset: Position;
}

export interface DetectionCompleteEvent {
  documentId: string;
  pageIndex: number;
  blocks: PdfTextBlock[];
}

// ─────────────────────────────────────────────────────────
// Registration Options
// ─────────────────────────────────────────────────────────

export interface RegisterEditOnPageOptions {
  documentId: string;
  pageIndex: number;
  onStateChange: (state: EditPageState) => void;
}

// ─────────────────────────────────────────────────────────
// Render Options (for components)
// ─────────────────────────────────────────────────────────

export interface RenderBackgroundOptions {
  scale: number;
  rotation?: number;
}

export interface RenderTextBlockOptions {
  blockIndex: number;
  scale: number;
  rotation?: number;
}

// ─────────────────────────────────────────────────────────
// Capability (Document-Scoped)
// ─────────────────────────────────────────────────────────

export interface EditScope {
  /** Trigger text block detection for a page */
  detectBlocks(pageIndex: number, options?: DetectBlocksOptions): PdfTask<boolean>;
  /** Invalidate and re-detect text blocks */
  invalidateAndRedetect(pageIndex: number, options?: DetectBlocksOptions): PdfTask<boolean>;
  /** Get detected text blocks for a page */
  getTextBlocks(pageIndex: number): PdfTextBlock[];
  /** Get the full page state */
  getPageState(pageIndex: number): EditPageState | null;
  /** Get layout summary for a page */
  getLayoutSummary(pageIndex: number): PdfLayoutSummary | null;
  /** Get detected words for a page */
  getWords(pageIndex: number): PdfWord[];
  /** Get detected lines for a page */
  getLines(pageIndex: number): PdfLine[];
  /** Get detected columns for a page */
  getColumns(pageIndex: number): PdfColumn[];
  /** Get detected tables for a page */
  getTables(pageIndex: number): PdfTable[];
  /** Select a text block (or deselect with null) */
  selectBlock(pageIndex: number, blockIndex: number | null): void;
  /** Get the currently selected block */
  getSelectedBlock(): { pageIndex: number; blockIndex: number; block: PdfTextBlock } | null;
  /** Set a visual offset for a block (for drag preview) */
  setBlockOffset(pageIndex: number, blockIndex: number, offset: Position): void;
  /** Clear the offset for a block */
  clearBlockOffset(pageIndex: number, blockIndex: number): void;
  /** Get the current offset for a block */
  getBlockOffset(pageIndex: number, blockIndex: number): Position | null;
  /** Render the page background (without text blocks) */
  renderBackground(pageIndex: number, options: RenderBackgroundOptions): PdfTask<Blob>;
  /** Render a single text block */
  renderTextBlock(pageIndex: number, options: RenderTextBlockOptions): PdfTask<Blob>;
  /** Render debug overlay showing layout detection results */
  renderDebugOverlay(pageIndex: number, options: RenderDebugOverlayOptions): PdfTask<Blob>;
  /** Subscribe to page state changes */
  onPageStateChange: EventHook<EditPageState>;
  /** Subscribe to block selection changes */
  onBlockSelected: EventHook<{ blockIndex: number | null; block: PdfTextBlock | null }>;
}

// ─────────────────────────────────────────────────────────
// Capability (Global)
// ─────────────────────────────────────────────────────────

export interface EditCapability {
  // Active document operations (use active document)
  detectBlocks(pageIndex: number, options?: DetectBlocksOptions): PdfTask<boolean>;
  invalidateAndRedetect(pageIndex: number, options?: DetectBlocksOptions): PdfTask<boolean>;
  getTextBlocks(pageIndex: number): PdfTextBlock[];
  getPageState(pageIndex: number): EditPageState | null;
  getLayoutSummary(pageIndex: number): PdfLayoutSummary | null;
  getWords(pageIndex: number): PdfWord[];
  getLines(pageIndex: number): PdfLine[];
  getColumns(pageIndex: number): PdfColumn[];
  getTables(pageIndex: number): PdfTable[];
  selectBlock(pageIndex: number, blockIndex: number | null): void;
  getSelectedBlock(): { pageIndex: number; blockIndex: number; block: PdfTextBlock } | null;
  setBlockOffset(pageIndex: number, blockIndex: number, offset: Position): void;
  clearBlockOffset(pageIndex: number, blockIndex: number): void;
  getBlockOffset(pageIndex: number, blockIndex: number): Position | null;
  renderBackground(pageIndex: number, options: RenderBackgroundOptions): PdfTask<Blob>;
  renderTextBlock(pageIndex: number, options: RenderTextBlockOptions): PdfTask<Blob>;
  renderDebugOverlay(pageIndex: number, options: RenderDebugOverlayOptions): PdfTask<Blob>;

  // Document-scoped operations
  forDocument(documentId: string): EditScope;

  // Registration (for components)
  registerEditOnPage(options: RegisterEditOnPageOptions): () => void;

  // Global events (include documentId)
  onPageStateChange: EventHook<EditPageStateChangeEvent>;
  onBlockSelected: EventHook<BlockSelectedEvent>;
  onBlockOffsetChange: EventHook<BlockOffsetChangeEvent>;
  onDetectionComplete: EventHook<DetectionCompleteEvent>;
}
