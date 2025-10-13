import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { Rect } from '@embedpdf/models';

export interface ViewportState {
  viewportGap: number;
  // Per-document viewport state (persisted)
  documents: Record<string, ViewportDocumentState>;
  // Currently active/mounted viewports (temporary)
  activeViewports: Set<string>; // documentIds that have mounted viewports
  activeDocumentId: string | null;
}

export interface ViewportDocumentState {
  viewportMetrics: ViewportMetrics;
  isScrolling: boolean;
  isSmoothScrolling: boolean;
}

export interface ViewportPluginConfig extends BasePluginConfig {
  viewportGap?: number;
  scrollEndDelay?: number;
}

export interface ViewportInputMetrics {
  width: number;
  height: number;
  scrollTop: number;
  scrollLeft: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
}

export interface ViewportMetrics extends ViewportInputMetrics {
  relativePosition: {
    x: number;
    y: number;
  };
}

export interface ViewportScrollMetrics {
  scrollTop: number;
  scrollLeft: number;
}

export interface ScrollToPayload {
  x: number;
  y: number;
  behavior?: ScrollBehavior;
  center?: boolean;
}

export interface ScrollActivity {
  isSmoothScrolling: boolean;
  isScrolling: boolean;
}

// Events include documentId
export interface ViewportEvent {
  documentId: string;
  metrics: ViewportMetrics;
}

export interface ScrollActivityEvent {
  documentId: string;
  activity: ScrollActivity;
}

export interface ScrollChangeEvent {
  documentId: string;
  scrollMetrics: ViewportScrollMetrics;
}

// Scoped viewport capability
export interface ViewportScope {
  getMetrics(): ViewportMetrics;
  scrollTo(position: ScrollToPayload): void;
  isScrolling(): boolean;
  isSmoothScrolling(): boolean;
  getBoundingRect(): Rect;
  onViewportChange: EventHook<ViewportMetrics>;
  onScrollChange: EventHook<ViewportScrollMetrics>;
  onScrollActivity: EventHook<ScrollActivity>;
}

export interface ViewportCapability {
  // Global
  getViewportGap(): number;

  // Active document operations
  getMetrics(): ViewportMetrics;
  scrollTo(position: ScrollToPayload): void;
  isScrolling(): boolean;
  isSmoothScrolling(): boolean;
  getBoundingRect(): Rect;

  // Document-scoped operations
  forDocument(documentId: string): ViewportScope;

  // Check if viewport is mounted
  isViewportMounted(documentId: string): boolean;

  // Events
  onViewportChange: EventHook<ViewportEvent>;
  onViewportResize: EventHook<ViewportEvent>;
  onScrollChange: EventHook<ScrollChangeEvent>;
  onScrollActivity: EventHook<ScrollActivityEvent>;
}
