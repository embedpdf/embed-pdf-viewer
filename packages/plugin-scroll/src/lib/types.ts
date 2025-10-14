import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { PdfPageObject, Rect, Rotation } from '@embedpdf/models';
import { ViewportMetrics } from '@embedpdf/plugin-viewport';
import { VirtualItem } from './types/virtual-item';

export type ScrollBehavior = 'instant' | 'smooth' | 'auto';

export interface PageChangeState {
  isChanging: boolean;
  targetPage: number;
  fromPage: number;
  startTime: number;
}

// Per-document scroll state
export interface ScrollDocumentState {
  virtualItems: VirtualItem[];
  totalPages: number;
  currentPage: number;
  totalContentSize: { width: number; height: number };
  strategy: ScrollStrategy;
  pageGap: number;
  scale: number;

  // Scroll metrics
  visiblePages: number[];
  pageVisibilityMetrics: PageVisibilityMetrics[];
  renderedPageIndexes: number[];
  scrollOffset: { x: number; y: number };
  startSpacing: number;
  endSpacing: number;
  pageChangeState: PageChangeState;
}

// Plugin state
export interface ScrollState {
  // Global defaults (applied to new documents)
  defaultStrategy: ScrollStrategy;
  defaultPageGap: number;
  defaultBufferSize: number;

  // Per-document states
  documents: Record<string, ScrollDocumentState>;
}

export interface ScrollerLayout {
  startSpacing: number;
  endSpacing: number;
  totalWidth: number;
  totalHeight: number;
  pageGap: number;
  strategy: ScrollStrategy;
  items: VirtualItem[];
}

export enum ScrollStrategy {
  Vertical = 'vertical',
  Horizontal = 'horizontal',
}

export interface PageVisibilityMetrics {
  pageNumber: number;
  viewportX: number;
  viewportY: number;
  visiblePercentage: number;
  original: {
    pageX: number;
    pageY: number;
    visibleWidth: number;
    visibleHeight: number;
    scale: number;
  };
  scaled: {
    pageX: number;
    pageY: number;
    visibleWidth: number;
    visibleHeight: number;
    scale: number;
  };
}

export interface ScrollMetrics {
  currentPage: number;
  visiblePages: number[];
  pageVisibilityMetrics: PageVisibilityMetrics[];
  renderedPageIndexes: number[];
  scrollOffset: { x: number; y: number };
  startSpacing: number;
  endSpacing: number;
}

export interface ScrollPluginConfig extends BasePluginConfig {
  defaultStrategy?: ScrollStrategy;
  defaultPageGap?: number;
  defaultBufferSize?: number;
  initialPage?: number;
}

export type LayoutChangePayload = Pick<ScrollDocumentState, 'virtualItems' | 'totalContentSize'>;

export interface ScrollToPageOptions {
  pageNumber: number;
  pageCoordinates?: { x: number; y: number };
  behavior?: ScrollBehavior;
  center?: boolean;
}

// Events include documentId
export interface PageChangeEvent {
  documentId: string;
  pageNumber: number;
  totalPages: number;
}

export interface ScrollEvent {
  documentId: string;
  metrics: ScrollMetrics;
}

export interface LayoutChangeEvent {
  documentId: string;
  layout: LayoutChangePayload;
}

export interface PageChangeStateEvent {
  documentId: string;
  state: PageChangeState;
}

export interface LayoutReadyEvent {
  documentId: string;
}

// Scoped scroll capability
export interface ScrollScope {
  getCurrentPage(): number;
  getTotalPages(): number;
  getPageChangeState(): PageChangeState;
  scrollToPage(options: ScrollToPageOptions): void;
  scrollToNextPage(behavior?: ScrollBehavior): void;
  scrollToPreviousPage(behavior?: ScrollBehavior): void;
  getMetrics(viewport?: ViewportMetrics): ScrollMetrics;
  getLayout(): LayoutChangePayload;
  getRectPositionForPage(
    page: number,
    rect: Rect,
    scale?: number,
    rotation?: Rotation,
  ): Rect | null;
  onPageChange: EventHook<PageChangeEvent>;
  onScroll: EventHook<ScrollMetrics>;
  onLayoutChange: EventHook<LayoutChangePayload>;
}

export interface ScrollCapability {
  // Active document operations (defaults to active document)
  getCurrentPage(): number;
  getTotalPages(): number;
  getPageChangeState(): PageChangeState;
  scrollToPage(options: ScrollToPageOptions): void;
  scrollToNextPage(behavior?: ScrollBehavior): void;
  scrollToPreviousPage(behavior?: ScrollBehavior): void;
  getMetrics(viewport?: ViewportMetrics): ScrollMetrics;
  getLayout(): LayoutChangePayload;
  getRectPositionForPage(
    page: number,
    rect: Rect,
    scale?: number,
    rotation?: Rotation,
  ): Rect | null;

  // Document-scoped operations
  forDocument(documentId: string): ScrollScope;

  // Global settings
  setScrollStrategy(strategy: ScrollStrategy, documentId?: string): void;
  getPageGap(): number;

  // Events (all include documentId)
  onPageChange: EventHook<PageChangeEvent>;
  onScroll: EventHook<ScrollEvent>;
  onLayoutChange: EventHook<LayoutChangeEvent>;
  onLayoutReady: EventHook<LayoutReadyEvent>;
  onPageChangeState: EventHook<PageChangeStateEvent>;
  onStateChange: EventHook<ScrollDocumentState>;
}
