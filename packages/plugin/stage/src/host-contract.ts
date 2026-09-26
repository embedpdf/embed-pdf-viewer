import { createHostToken, type PageRef, type Unsubscribe } from '@embedpdf/core';
import type { Point, Rect } from '@embedpdf/core-geometry';
import type { Camera, ScrollMetrics, Size } from '@embedpdf/core-stage';

import type { StageCapability, StageViewState, ViewportPoint } from './contract';
import { StageToken as PublicStageToken } from './token';

export * from './contract';
export type { StageState } from './model';

/**
 * The host lens: what the surface binding, the gesture controller and sibling
 * plugins need. The same runtime token as the public contract, typed wider.
 */
export interface StageHostCapability extends StageCapability {
  /** Report the container box (ResizeObserver); the first real size triggers placement. */
  setViewportSize(size: Size): void;
  /** Report the device pixel ratio so page transforms render crisp. */
  setDevicePixelRatio(ratio: number): void;
  /** Bracket a direct-manipulation gesture (touch pan / pinch); `elastic` enables rubber-band. */
  beginGesture(options?: { elastic?: boolean }): void;
  endGesture(): void;
  /** Momentum pan from a release velocity in viewport px/s. */
  fling(velocityX: number, velocityY: number): void;
  /** The touch double-tap zoom ladder around a viewport point. */
  doubleTapZoom(point: ViewportPoint): void;
  /** Zoom by a factor holding a viewport point fixed — the pinch primitive. */
  zoomAround(point: ViewportPoint, factor: number): void;
  /** The camera as a native scroller, in viewport px. Reference-stable. */
  getScrollMetrics(): ScrollMetrics;
  worldToViewport(world: Point): ViewportPoint;
  viewportToWorld(point: ViewportPoint): Point;
  pageToWorld(page: PageRef, point: Point): Point | null;
  /** Offer a candidate initial view; the highest-priority non-null wins at placement. */
  provideInitialView(priority: number, provider: () => StageViewState | null): Unsubscribe;
  /** Resolve the registered providers once (else reset). Called when the viewport is ready. */
  placeInitial(): void;
  /** Re-resolve the zoom intent against the current scene (wired to the page registry). */
  refit(): void;
  /** This lens's identity — the stage plugin id; pointer samples are stamped with it. */
  getLensId(): string;
}

export const StageToken = createHostToken<StageHostCapability>(PublicStageToken);
export type { Camera, Point, Rect, ScrollMetrics, Size };
