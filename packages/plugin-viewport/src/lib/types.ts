import { BasePluginConfig, EventControlOptions, EventHook } from '@embedpdf/core';
import { Rect } from '@embedpdf/models';

export interface ViewportState {
  viewportGap: number;
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

export interface ScrollControlOptions {
  mode: 'debounce' | 'throttle';
  wait: number;
}

export interface ScrollToPayload {
  x: number;
  y: number;
  behavior?: ScrollBehavior;
  center?: boolean;
}

// New scroll activity type
export interface ScrollActivity {
  /** Whether a smooth scroll animation is in progress */
  isSmoothScrolling: boolean;
  /** Whether any scrolling activity is happening */
  isScrolling: boolean;
}

export interface ViewportCapability {
  getViewportGap: () => number;
  getMetrics: () => ViewportMetrics;
  scrollTo(position: ScrollToPayload): void;
  onViewportChange: EventHook<ViewportMetrics>;
  onViewportResize: EventHook<ViewportMetrics>;
  onScrollChange: EventHook<ViewportScrollMetrics>;
  onScrollActivity: EventHook<ScrollActivity>;
  isScrolling: () => boolean;
  isSmoothScrolling: () => boolean;
  getBoundingRect(): Rect;
}
