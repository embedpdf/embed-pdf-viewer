import { BasePluginConfig, Emitter, EventHook } from '@embedpdf/core';
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

export interface ScrollState extends ScrollMetrics {
  virtualItems: VirtualItem[];
  totalPages: number;
  totalContentSize: { width: number; height: number };
  desiredScrollPosition: { x: number; y: number };
  strategy: ScrollStrategy;
  pageGap: number;
  scale: number;
  pageChangeState: PageChangeState;
}

export interface ScrollerLayout {
  startSpacing: number;
  endSpacing: number;
  totalWidth: number;
  totalHeight: number;
  pageGap: number;
  strategy: ScrollState['strategy'];
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

export interface ScrollStrategyInterface {
  initialize(container: HTMLElement, innerDiv: HTMLElement): void;
  destroy(): void;
  updateLayout(viewport: ViewportMetrics, pdfPageObject: PdfPageObject[][]): void;
  handleScroll(viewport: ViewportMetrics): void;
  getVirtualItems(): VirtualItem[];
  scrollToPage(pageNumber: number, behavior?: ScrollBehavior): void;
  calculateDimensions(pdfPageObject: PdfPageObject[][]): void;
}

export interface ScrollPluginConfig extends BasePluginConfig {
  strategy?: ScrollStrategy;
  initialPage?: number;
  bufferSize?: number;
  pageGap?: number;
}

export type LayoutChangePayload = Pick<ScrollState, 'virtualItems' | 'totalContentSize'>;

export interface ScrollToPageOptions {
  pageNumber: number;
  pageCoordinates?: { x: number; y: number };
  behavior?: ScrollBehavior;
  center?: boolean;
}

export interface PageChangePayload {
  pageNumber: number;
  totalPages: number;
}

export interface ScrollCapability {
  onStateChange: EventHook<ScrollState>;
  onScroll: EventHook<ScrollMetrics>;
  getCurrentPage(): number;
  getTotalPages(): number;
  getPageChangeState(): PageChangeState;
  onPageChange: EventHook<PageChangePayload>;
  onLayoutChange: EventHook<LayoutChangePayload>;
  onPageChangeState: EventHook<PageChangeState>;
  onLayoutReady: EventHook<boolean>;
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
  setScrollStrategy(strategy: ScrollStrategy): void;
  getPageGap(): number;
  getPageChangeState: () => PageChangeState;
}
