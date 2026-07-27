import type { PageImageHandle } from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';

/**
 * The demand a page HOST supplies (SCALE-OUT §2.1e dependency inversion):
 * plugin-render defines the shape, producers fill it. The Stage's page
 * host knows the camera and supplies `visibleRect`/`velocity`; a
 * stage-less `<PageView>` supplies neither — absent `visibleRect` means
 * "assume the whole page is visible", which a thumbnail-sized demand
 * turns into "no tiles engage" by arithmetic, not configuration.
 */
export interface PageViewDemand {
  /** Desired device pixels across the page's unrotated content width. */
  desiredDeviceWidth: number;
  /** Visible page region — y-down page points. ABSENT = whole page. */
  visibleRect?: Rect;
  /** Scroll velocity in page points/s — prefetch direction bias only. */
  velocity?: { dx: number; dy: number };
}

/**
 * One tile the layer should have in the DOM. `key` is the reconciliation
 * identity (stable across plan recomputes — keyed lists preserve the DOM
 * node, which IS the retention mechanism); `rect` is y-down page points
 * inside the unrotated content box; `z` stacks by resolution so arriving
 * sharper tiles occlude retained coarser ones per region.
 */
export interface TilePaintSource {
  key: string;
  scale: number;
  rect: Rect;
  z: number;
  handle: PageImageHandle;
}

/**
 * What a TileLayer paints right now. `paint` draws ONLY from resolved
 * rasters — retained generations live here until the release rules fire;
 * "loading" never reaches the DOM. `fetching` is diagnostic (badge/tests).
 */
export interface TilePaintPlan {
  /** Tiles engaged at all? False = the base rung fully covers demand. */
  engaged: boolean;
  paint: TilePaintSource[];
  /** Keys currently in flight (want-set members not yet resolved). */
  fetching: string[];
  /** Memoization stamp — a new object appears only when this changes. */
  stamp: string;
}

export const EMPTY_TILE_PLAN: TilePaintPlan = {
  engaged: false,
  paint: [],
  fetching: [],
  stamp: 'empty',
};

/** Resolved tiling configuration (renderPlugin options + defaults). */
export interface TilingConfig {
  /** Tile edge in device px. Default 512. */
  tileSize?: number;
  /**
   * Client pyramid used while the policy doesn't advertise `tiles`
   * (reserved until WS2c). Default `[1, 2, 4, 8, 16, 32]` — ×2 aligned.
   */
  scales?: readonly number[];
  /**
   * Sharpness deficit (desired ÷ supplied-by-base) above which tiles
   * engage. Default 1.25 — small CSS upscales read fine; past that the
   * ladder cap is visible and the pyramid takes over.
   */
  engageAt?: number;
  /** Prefetch ring around the visible rect. */
  prefetch?: {
    /** Extra coverage per side, in fractions of the visible rect. Default 0.5. */
    margin?: number;
    /** Stretch the ring toward scroll direction. Default true. */
    velocityBias?: boolean;
  };
  /**
   * Hysteresis for LEVEL changes (a zoom settling between pyramid rungs):
   * tile fetches for a NEW level wait this long; pan-driven fetches at the
   * current level fire immediately. Default 150ms; 0 disables.
   */
  settleMs?: number;
}

export interface ResolvedTiling {
  tileSize: number;
  scales: readonly number[];
  engageAt: number;
  prefetchMargin: number;
  velocityBias: boolean;
  settleMs: number;
}

export function resolveTiling(config: TilingConfig | undefined): ResolvedTiling {
  return {
    tileSize: config?.tileSize ?? 512,
    scales: config?.scales ?? [1, 2, 4, 8, 16, 32],
    engageAt: config?.engageAt ?? 1.25,
    prefetchMargin: config?.prefetch?.margin ?? 0.5,
    velocityBias: config?.prefetch?.velocityBias ?? true,
    settleMs: config?.settleMs ?? 150,
  };
}
