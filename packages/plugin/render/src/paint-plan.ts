import type { PageImageHandle } from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';

/**
 * The demand a page HOST supplies through dependency inversion:
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
 * What a tile plane paints right now. `paint` draws ONLY from resolved
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

/**
 * The base-plane strategy: the pixel BUDGET and the render points below it.
 * Device px throughout (CSS px × devicePixelRatio).
 */
export interface FullPageOptions {
  /**
   * The budget: no full-page raster ever renders wider. Small by design —
   * the base is the instant backdrop; sharpness past it is the tile plane's
   * job. Default 640.
   */
  maxWidth?: number;
  /**
   * Render points under a `continuous` policy. `'exact'` (default) renders
   * the settled demand precisely — resting pixels are never resampled, the
   * only way ~1px text stems stay crisp on dpr-1 screens. A width ladder
   * opts into rung caching instead (defensible on dpr≥2 embeds). An
   * advertised deployment lattice always wins over either.
   */
  quantize?: 'exact' | readonly number[];
}

/** The tile-plane strategy. Pass `tiles: false` to disable the plane. */
export interface TilesOptions {
  /** Tile edge in device px. Default 512 (policy `tileSizes` win when advertised). */
  size?: number;
  /**
   * Tile levels under a `continuous` policy: `'exact'` (default) renders the
   * settled scale precisely; a scale ladder opts into pyramid reuse. An
   * advertised `policy.tiles` block always wins.
   */
  quantize?: 'exact' | readonly number[];
  /** Exact-mode safety clamp on the tile level (device px per point). Default 64. */
  maxScale?: number;
  /**
   * Sharpness deficit (desired ÷ supplied-by-base) above which tiles engage.
   * Resolved default: 1.0 when the base is exact (nothing may rest
   * stretched), 1.25 under a lattice.
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
   * Settle gate for LEVEL changes (a zoom in motion): tile fetches for a new
   * level wait this long; pan-driven fetches at the current level fire
   * immediately. Default 150ms; 0 disables.
   */
  settleMs?: number;
  /** Optional arrival cross-fade for tiles, in ms. Default 0 (hard pop —
   *  clean once painting is decode-gated). */
  fadeMs?: number;
}

/** The ×2 client pyramid used for lattice deployments without a tiles block. */
export const DEFAULT_TILE_PYRAMID: readonly number[] = [1, 2, 4, 8, 16, 32];

export interface ResolvedRenderOptions {
  fullPage: {
    maxWidth: number;
    /** True when the embedder set maxWidth themselves — only then does it
     *  also filter an ADVERTISED deployment ladder (the mobile-memory
     *  knob); the default budget governs the client's own strategy only. */
    maxWidthExplicit: boolean;
    quantize: 'exact' | readonly number[];
  };
  tiles: {
    enabled: boolean;
    size: number;
    quantize: 'exact' | readonly number[];
    maxScale: number;
    engageAt: number | undefined;
    prefetchMargin: number;
    velocityBias: boolean;
    settleMs: number;
    fadeMs: number;
    /** Pyramid for lattice deployments that don't advertise tiles yet. */
    fallbackPyramid: readonly number[];
  };
  format?: 'png' | 'webp' | 'bmp';
  quality?: number;
}

export function resolveRenderOptions(options: {
  fullPage?: FullPageOptions;
  tiles?: TilesOptions | false;
  format?: 'png' | 'webp' | 'bmp';
  quality?: number;
}): ResolvedRenderOptions {
  const tiles = options.tiles === false ? undefined : options.tiles;
  return {
    fullPage: {
      maxWidth: options.fullPage?.maxWidth ?? 640,
      maxWidthExplicit: options.fullPage?.maxWidth !== undefined,
      quantize: options.fullPage?.quantize ?? 'exact',
    },
    tiles: {
      enabled: options.tiles !== false,
      size: tiles?.size ?? 512,
      quantize: tiles?.quantize ?? 'exact',
      maxScale: tiles?.maxScale ?? 64,
      engageAt: tiles?.engageAt,
      prefetchMargin: tiles?.prefetch?.margin ?? 0.5,
      velocityBias: tiles?.prefetch?.velocityBias ?? true,
      settleMs: tiles?.settleMs ?? 150,
      fadeMs: tiles?.fadeMs ?? 0,
      fallbackPyramid: DEFAULT_TILE_PYRAMID,
    },
    format: options.format,
    quality: options.quality,
  };
}
