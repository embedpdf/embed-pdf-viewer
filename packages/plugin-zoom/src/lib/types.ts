import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { Rect } from '@embedpdf/models';
import { ViewportMetrics } from '@embedpdf/plugin-viewport';

/* ------------------------------------------------------------------ */
/* public                                                               */
/* ------------------------------------------------------------------ */

export enum ZoomMode {
  Automatic = 'automatic',
  FitPage = 'fit-page',
  FitWidth = 'fit-width',
}

export type ZoomLevel = ZoomMode | number;

export interface Point {
  vx: number;
  vy: number;
}

export interface ZoomChangeEvent {
  documentId: string;
  /** old and new *actual* scale factors */
  oldZoom: number;
  newZoom: number;
  /** level used to obtain the newZoom (number | mode) */
  level: ZoomLevel;
  /** viewport point kept under the finger / mouse‑wheel focus */
  center: Point;
  /** where the viewport should scroll to after the scale change */
  desiredScrollLeft: number;
  desiredScrollTop: number;
  /** metrics at the moment the zoom was requested */
  viewport: ViewportMetrics;
}

export interface StateChangeEvent {
  documentId: string;
  state: ZoomDocumentState;
}

export interface MarqueeZoomCallback {
  onPreview?: (rect: Rect | null) => void;
  onCommit?: (rect: Rect) => void;
  onSmallDrag?: () => void;
}

export interface RegisterMarqueeOnPageOptions {
  documentId: string;
  pageIndex: number;
  scale: number;
  callback: MarqueeZoomCallback;
}

// Per-document zoom state
export interface ZoomDocumentState {
  zoomLevel: ZoomLevel; // last **requested** level
  currentZoomLevel: number; // actual numeric factor
}

// Scoped zoom capability
export interface ZoomScope {
  requestZoom(level: ZoomLevel, center?: Point): void;
  requestZoomBy(delta: number, center?: Point): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomToArea(pageIndex: number, rect: Rect): void;
  enableMarqueeZoom(): void;
  disableMarqueeZoom(): void;
  toggleMarqueeZoom(): void;
  isMarqueeZoomActive(): boolean;
  getState(): ZoomDocumentState;
  onZoomChange: EventHook<ZoomChangeEvent>;
  onStateChange: EventHook<ZoomDocumentState>;
}

export interface ZoomCapability {
  // Active document operations
  requestZoom(level: ZoomLevel, center?: Point): void;
  requestZoomBy(delta: number, center?: Point): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomToArea(pageIndex: number, rect: Rect): void;
  enableMarqueeZoom(): void;
  disableMarqueeZoom(): void;
  toggleMarqueeZoom(): void;
  isMarqueeZoomActive(): boolean;
  getState(): ZoomDocumentState;

  // Document-scoped operations
  forDocument(documentId: string): ZoomScope;

  // Global
  registerMarqueeOnPage: (opts: RegisterMarqueeOnPageOptions) => () => void;
  getPresets(): ZoomPreset[];

  // Events (include documentId)
  onZoomChange: EventHook<ZoomChangeEvent>;
  onStateChange: EventHook<StateChangeEvent>;
}

/* ------------------------------------------------------------------ */
/* config / store                                                      */
/* ------------------------------------------------------------------ */

export interface ZoomRangeStep {
  min: number;
  max: number;
  step: number;
}

export interface ZoomPreset {
  name: string;
  value: ZoomLevel;
  icon?: string;
}

export interface ZoomPluginConfig extends BasePluginConfig {
  defaultZoomLevel: ZoomLevel;
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
  zoomRanges?: ZoomRangeStep[];
  presets?: ZoomPreset[];
}

export interface ZoomState {
  // Per-document zoom state
  documents: Record<string, ZoomDocumentState>;
  activeDocumentId: string | null;
}

export enum VerticalZoomFocus {
  Center,
  Top,
}

export interface ZoomRequest {
  level: ZoomLevel;
  delta?: number;
  center?: Point;
  focus?: VerticalZoomFocus;
  align?: 'keep' | 'center';
}
