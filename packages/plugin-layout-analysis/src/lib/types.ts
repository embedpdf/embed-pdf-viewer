import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { Task, Rect, Size, Rotation } from '@embedpdf/models';
import { AiErrorReason } from '@embedpdf/ai';

// ─── Plugin Config ─────────────────────────────────────────

export interface LayoutAnalysisPluginConfig extends BasePluginConfig {
  /** Detection confidence threshold (default: 0.35). */
  threshold?: number;
  /** Enable table structure analysis (default: false). */
  tableStructure?: boolean;
  /** Auto-analyze when a page first loads (default: false). */
  autoAnalyze?: boolean;
  /** Scale factor for rendering pages before analysis (default: 2.0). */
  renderScale?: number;
}

// ─── Result Types ──────────────────────────────────────────

/**
 * A single layout block in PDF page coordinates (points).
 */
export interface LayoutBlock {
  /** Unique ID for this detection. */
  id: number;
  /** Numeric class ID from the model. */
  classId: number;
  /** Human-readable label (e.g., 'text', 'table', 'image'). */
  label: string;
  /** Confidence score (0 to 1). */
  score: number;
  /** Bounding box in PDF page coordinates (points) [x, y, width, height]. */
  rect: Rect;
  /** Bounding box in source image coordinates [x1, y1, x2, y2]. */
  imageBbox: [number, number, number, number];
  /** Reading order index. */
  readingOrder: number;
}

/**
 * Table structure element in PDF page coordinates.
 */
export interface TableStructureElement {
  classId: number;
  label: string;
  score: number;
  rect: Rect;
}

/**
 * Layout analysis result for a single page.
 */
export interface PageLayout {
  pageIndex: number;
  blocks: LayoutBlock[];
  tableStructures: Map<number, TableStructureElement[]>;
  /** The image dimensions used for analysis. */
  imageSize: Size;
  /** The PDF page size in points. */
  pageSize: Size;
}

/**
 * Layout analysis result for an entire document.
 */
export interface DocumentLayout {
  pages: PageLayout[];
}

// ─── Progress Types ────────────────────────────────────────

export type PageAnalysisProgress =
  | { stage: 'rendering'; pageIndex: number }
  | { stage: 'downloading-model'; pageIndex: number; loaded: number; total: number }
  | { stage: 'creating-session'; pageIndex: number }
  | { stage: 'layout-detection'; pageIndex: number }
  | { stage: 'table-structure'; pageIndex: number; tableIndex: number; tableCount: number }
  | { stage: 'mapping-coordinates'; pageIndex: number };

export type DocumentAnalysisProgress =
  | { stage: 'page-complete'; pageIndex: number; completed: number; total: number }
  | PageAnalysisProgress;

export type LayoutAnalysisErrorReason =
  | AiErrorReason
  | { type: 'render-failed'; pageIndex: number; message: string }
  | { type: 'no-document'; message: string };

export type LayoutTask<R, P = unknown> = Task<R, LayoutAnalysisErrorReason, P>;

// ─── Plugin State ──────────────────────────────────────────

export type PageAnalysisStatus = 'idle' | 'analyzing' | 'complete' | 'error';

export interface PageAnalysisState {
  status: PageAnalysisStatus;
  layout: PageLayout | null;
  error: string | null;
}

export interface LayoutAnalysisState {
  documents: Record<
    string,
    {
      pages: Record<number, PageAnalysisState>;
    }
  >;
  overlayVisible: boolean;
  selectedBlockId: number | null;
  activeThreshold: number;
}

// ─── Events ────────────────────────────────────────────────

export interface PageLayoutChangeEvent {
  pageIndex: number;
  layout: PageLayout | null;
}

export interface PageLayoutChangeGlobalEvent extends PageLayoutChangeEvent {
  documentId: string;
}

// ─── Capability ────────────────────────────────────────────

export interface LayoutAnalysisScope {
  analyzePage(pageIndex: number): LayoutTask<PageLayout, PageAnalysisProgress>;
  analyzeAllPages(): LayoutTask<DocumentLayout, DocumentAnalysisProgress>;
  getPageLayout(pageIndex: number): PageLayout | null;
  onPageLayoutChange: EventHook<PageLayoutChangeEvent>;
}

export interface LayoutAnalysisCapability {
  analyzePage(pageIndex: number): LayoutTask<PageLayout, PageAnalysisProgress>;
  analyzeAllPages(): LayoutTask<DocumentLayout, DocumentAnalysisProgress>;
  getPageLayout(pageIndex: number): PageLayout | null;
  forDocument(documentId: string): LayoutAnalysisScope;

  onPageLayoutChange: EventHook<PageLayoutChangeGlobalEvent>;

  setOverlayVisible(visible: boolean): void;
  setThreshold(threshold: number): void;
  selectBlock(blockId: number | null): void;
}
