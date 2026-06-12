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
  currentZoomLevel: number; // actual numeric factor (effective / render scale)
  // user-space scale = currentZoomLevel / DPR
  // equals currentZoomLevel when usePhysicalScaling is off
  currentUserZoomLevel: number;
  isMarqueeZoomActive: boolean; // whether marquee zoom mode is active
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
  /**
   * The combined physical-scale multiplier currently in effect:
   * `(96 / 72) × devicePixelRatio` — the pt-to-CSS-px constant times the
   * device pixel ratio. Returns 1 when `usePhysicalScaling` is disabled.
   */
  getDpr(): number;
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
  /**
   * The combined physical-scale multiplier currently in effect:
   * `(96 / 72) × devicePixelRatio` — the pt-to-CSS-px constant times the
   * device pixel ratio. Returns 1 when `usePhysicalScaling` is disabled.
   */
  getDpr(): number;

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
  /**
   * When true, treat all numeric zoom values as logical / user-space values
   * and multiply them by `(96 / 72) × devicePixelRatio` to obtain the actual
   * render scale. The `96/72` factor converts PDF points to CSS pixels
   * (1 CSS inch = 96 px, 1 PDF point = 1/72 inch), ensuring 100 % maps to
   * the display's physical DPI. The `devicePixelRatio` factor then keeps the
   * rendered size correct as the OS display scale changes.
   *
   * At 100 % zoom on a standard 96 DPI, DPR=1 screen, an A4 page is ~794 CSS
   * pixels wide — its true physical width — matching Acrobat's "Use system
   * setting" behaviour.
   *
   * Fit modes (`fit-width`, `fit-page`, `automatic`) are unaffected — they
   * continue to fit the viewport in CSS-pixel space.
   *
   * Default: `false` (1 PDF point = 1 CSS pixel — CSS-spec behaviour).
   */
  usePhysicalScaling?: boolean;
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
