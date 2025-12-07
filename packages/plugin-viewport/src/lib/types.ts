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
  gates: Set<string>;
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
  /**
   * Horizontal alignment as a percentage (0-100).
   * 0 = target at left edge, 50 = centered, 100 = target at right edge.
   */
  alignX?: number;
  /**
   * Vertical alignment as a percentage (0-100).
   * 0 = target at top edge, 50 = centered, 100 = target at bottom edge.
   * Useful for mobile where UI overlays may cover part of the screen.
   */
  alignY?: number;
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

export interface GateChangeEvent {
  documentId: string;
  isGated: boolean;
  gates: string[]; // All active gate keys
  addedGate?: string; // The gate that was just added
  removedGate?: string; // The gate that was just removed
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
  isGated(): boolean;
  hasGate(key: string): boolean;
  getGates(): string[];
  gate(key: string): void;
  releaseGate(key: string): void;
  getBoundingRect(): Rect;
  onViewportChange: EventHook<ViewportMetrics>;
  onScrollChange: EventHook<ViewportScrollMetrics>;
  onScrollActivity: EventHook<ScrollActivity>;
  onGateChange: EventHook<GateChangeEvent>;
}

export interface ViewportCapability {
  // Global
  getViewportGap(): number;

  // Active document operations
  getMetrics(): ViewportMetrics;
  scrollTo(position: ScrollToPayload): void;
  isScrolling(): boolean;
  isSmoothScrolling(): boolean;
  isGated(documentId?: string): boolean;
  hasGate(key: string, documentId?: string): boolean;
  getGates(documentId?: string): string[];
  getBoundingRect(): Rect;

  // Document-scoped operations
  forDocument(documentId: string): ViewportScope;
  gate(key: string, documentId: string): void;
  releaseGate(key: string, documentId: string): void;

  // Check if viewport is mounted
  isViewportMounted(documentId: string): boolean;

  // Events
  onViewportChange: EventHook<ViewportEvent>;
  onViewportResize: EventHook<ViewportEvent>;
  onScrollChange: EventHook<ScrollChangeEvent>;
  onScrollActivity: EventHook<ScrollActivityEvent>;
  onGateChange: EventHook<GateChangeEvent>;
}
