import {
  snapFullPageViewport,
  type EngineRenderPolicy,
  type PageImageHandle,
  type PdfRect,
} from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';

import {
  EMPTY_TILE_PLAN,
  type PageViewDemand,
  type ResolvedTiling,
  type TilePaintPlan,
  type TilePaintSource,
} from './paint-plan';
import type { RasterStore } from './raster-store';
import {
  inflateRect,
  intersectRects,
  regionCovered,
  snapToPyramid,
  tileGrid,
  tilesInRect,
  tileEngineRect,
  tilePaintRect,
  type PageSizePt,
  type TileCoord,
  type TileGrid,
} from './tiles';

/**
 * The tile retention state machine. One instance per
 * plugin instance (per document), all levels and pages in one place, over
 * the SAME RasterStore the base renders use.
 *
 * Invariant it enforces: every screen region paints the sharpest PAINTED
 * pixels available; quality per region only goes up until the want set
 * resolves. Mechanics:
 *   - want vs paint: `plan()` schedules fetches for the want set (P0
 *     visible first, P1 prefetch when P0 is fully resolved) and returns a
 *     paint list drawn ONLY from resolved entries — current level AND
 *     retained older generations.
 *   - release-on-occlusion: when a want-level tile reports PAINTED (the
 *     layer's img onload — the decode boundary), retained sources whose
 *     visible footprint is covered by painted want tiles leave the paint
 *     list. Their bytes stay in the RasterStore (demotion, not eviction) —
 *     zoom-back re-promotes from cache.
 *   - epoch exception: an invalidation bump means retained pixels are
 *     WRONG — everything of the old epoch drops immediately.
 *
 * `plan()` is called from selectors: it MUST NOT dispatch. Fetch kickoff
 * is idempotent (the store singleflights); resolution handlers dispatch
 * the wake-up (`onAdvance`) that makes subscribed layers recompute.
 */
export class TileManager {
  private readonly pages = new Map<number, PageTileState>();

  constructor(
    private readonly deps: {
      store: RasterStore;
      config: ResolvedTiling;
      /** The document fact off the kernel registry — never null: the kernel
       *  materializes it (continuous fallback) before the doc publishes. */
      getPolicy(): EngineRenderPolicy;
      getPageSize(pon: number): PageSizePt | undefined;
      getEpoch(pon: number, includeAnnotations: boolean): number;
      fetchTile(
        pon: number,
        rect: PdfRect,
        scale: number,
        includeAnnotations: boolean,
        signal: AbortSignal,
      ): Promise<PageImageHandle>;
      /** Wake subscribed layers (dispatches PAINT_ADVANCED outside plan()). */
      onAdvance(pon: number): void;
    },
  ) {}

  plan(pon: number, demand: PageViewDemand, includeAnnotations: boolean): TilePaintPlan {
    const { config } = this.deps;
    const policy = this.deps.getPolicy();
    const page = this.deps.getPageSize(pon);
    if (!page) return EMPTY_TILE_PLAN;

    const epoch = this.deps.getEpoch(pon, includeAnnotations);
    const state = this.pageState(pon);

    // Epoch exception: old-epoch pixels are WRONG, not blurry — drop all.
    if (state.epoch !== epoch) {
      this.abortAll(state);
      state.entries.clear();
      state.epoch = epoch;
      state.wantScale = null;
      state.planCache = null;
    }

    // Engagement: deficit of the base rung vs demand. Under `continuous`
    // the base supplies exactly what was asked — deficit 1, never engaged
    // (v2 exactness); memory protection there is the POLICY's job
    // (localEngine({ renderPolicy })), not this manager's.
    const baseSupplied =
      policy.kind === 'lattice'
        ? widthOf(snapFullPageViewport(policy, { kind: 'width', width: demand.desiredDeviceWidth }))
        : demand.desiredDeviceWidth;
    const deficit = demand.desiredDeviceWidth / baseSupplied;
    if (deficit <= config.engageAt) {
      if (state.entries.size || state.wantScale !== null) {
        this.abortAll(state);
        state.entries.clear();
        state.wantScale = null;
        state.planCache = null;
      }
      return EMPTY_TILE_PLAN;
    }

    // Level selection: use the advertised policy pyramid when available,
    // otherwise use client defaults — same snapped requests either way.
    const pyramid = policy.kind === 'lattice' && policy.tiles ? policy.tiles.scales : config.scales;
    const wantScale = snapToPyramid(pyramid, demand.desiredDeviceWidth / page.width);
    const grid = tileGrid(page, wantScale, config.tileSize);

    const visible = demand.visibleRect ?? { x: 0, y: 0, width: page.width, height: page.height };
    state.lastVisible = visible;
    const p0 = tilesInRect(grid, page, visible);
    const ring = inflateRect(
      visible,
      config.prefetchMargin,
      config.velocityBias ? demand.velocity : undefined,
    );
    const p0Keys = new Set(p0.map((c) => coordKey(c)));
    const p1 = tilesInRect(grid, page, ring).filter((c) => !p0Keys.has(coordKey(c)));

    this.schedule(pon, state, page, grid, wantScale, includeAnnotations, epoch, p0, p1);

    // Paint list: resolved entries intersecting the visible rect, coarser
    // levels first (painter's algorithm — sharper occludes per region).
    // The memo key holds SNAPPED values only (identity law): raw demand
    // width matters solely through engagement and the level, both already
    // folded in — zoom inside a level is plan-stable by construction.
    const demandKey = `${wantScale}|${rectKey(visible)}|e${epoch}`;
    if (
      state.planCache &&
      state.planCache.demandKey === demandKey &&
      state.planCache.version === state.version
    ) {
      return state.planCache.plan;
    }
    const paint: TilePaintSource[] = [];
    const fetching: string[] = [];
    for (const entry of state.entries.values()) {
      const visIntersect = intersectRects(entry.rect, visible);
      if (entry.handle) {
        if (visIntersect.width > 0 && visIntersect.height > 0) {
          paint.push({
            key: entry.key,
            scale: entry.scale,
            rect: entry.rect,
            z: zOf(pyramid, entry.scale),
            handle: entry.handle,
          });
        }
      } else if (entry.scale === wantScale) {
        fetching.push(entry.key);
      }
    }
    paint.sort((a, b) => a.z - b.z || a.key.localeCompare(b.key));
    const plan: TilePaintPlan = {
      engaged: true,
      paint,
      fetching: fetching.sort(),
      stamp: `${demandKey}|v${state.version}`,
    };
    state.planCache = { demandKey, version: state.version, plan };
    return plan;
  }

  /** The layer's decode-boundary report: this key's <img> actually painted. */
  sourcePainted(pon: number, key: string): void {
    const state = this.pages.get(pon);
    const entry = state?.entries.get(key);
    if (!state || !entry || entry.painted) return;
    entry.painted = true;
    this.releaseOccluded(state, entry);
    state.version += 1;
    state.planCache = null;
    this.deps.onAdvance(pon);
  }

  /** A lens unmounted its TileLayer: stop fetching, drop bookkeeping.
   *  Resolved bytes stay in the RasterStore for a re-mount. */
  releasePage(pon: number): void {
    const state = this.pages.get(pon);
    if (!state) return;
    this.abortAll(state);
    this.pages.delete(pon);
  }

  private pageState(pon: number): PageTileState {
    let state = this.pages.get(pon);
    if (!state) {
      state = {
        epoch: -1,
        wantScale: null,
        entries: new Map(),
        version: 0,
        planCache: null,
        settleTimer: null,
        pendingLevel: null,
        lastVisible: null,
      };
      this.pages.set(pon, state);
    }
    return state;
  }

  private schedule(
    pon: number,
    state: PageTileState,
    page: PageSizePt,
    grid: TileGrid,
    wantScale: number,
    includeAnnotations: boolean,
    epoch: number,
    p0: TileCoord[],
    p1: TileCoord[],
  ): void {
    const { config } = this.deps;
    const firstEngage = state.wantScale === null;
    const levelChanged = state.wantScale !== null && state.wantScale !== wantScale;
    state.wantScale = wantScale;

    // Abort in-flight fetches that left the want set (pan away, level
    // change) — resolved entries are retention's business, not ours.
    const wanted = new Set(
      [...p0, ...p1].map((c) => this.tileKey(pon, wantScale, c, includeAnnotations, epoch)),
    );
    for (const [key, entry] of state.entries) {
      if (entry.handle === undefined && !wanted.has(key)) {
        entry.abort?.abort();
        state.entries.delete(key);
      }
    }

    const kickoff = () => {
      const allP0Ready = this.ensureFetches(pon, state, page, grid, includeAnnotations, epoch, p0);
      // P1 strictly after P0: prefetch never competes with on-screen tiles.
      if (allP0Ready) this.ensureFetches(pon, state, page, grid, includeAnnotations, epoch, p1);
    };

    // Level-change hysteresis: a zoom passing THROUGH levels shouldn't
    // fetch each intermediate one. First engagement fires immediately —
    // there's nothing on screen above the base yet.
    if (levelChanged && config.settleMs > 0) {
      state.pendingLevel = wantScale;
      if (state.settleTimer !== null) clearTimeout(state.settleTimer);
      state.settleTimer = setTimeout(() => {
        state.settleTimer = null;
        if (state.pendingLevel === wantScale) kickoff();
      }, config.settleMs);
      return;
    }
    if (state.settleTimer !== null && !levelChanged && !firstEngage) {
      // Same level again before the timer fired — the zoom came back;
      // cancel the pending level fetch.
      clearTimeout(state.settleTimer);
      state.settleTimer = null;
      state.pendingLevel = null;
    }
    kickoff();
  }

  /** Start missing fetches; true when every coord is already resolved. */
  private ensureFetches(
    pon: number,
    state: PageTileState,
    page: PageSizePt,
    grid: TileGrid,
    includeAnnotations: boolean,
    epoch: number,
    coords: TileCoord[],
  ): boolean {
    let allReady = true;
    for (const coord of coords) {
      const key = this.tileKey(pon, grid.scale, coord, includeAnnotations, epoch);
      const existing = state.entries.get(key);
      if (existing) {
        if (existing.handle === undefined) allReady = false;
        continue;
      }
      allReady = false;
      const abort = new AbortController();
      const entry: TileEntry = {
        key,
        scale: grid.scale,
        coord,
        rect: tilePaintRect(grid, page, coord),
        painted: false,
        abort,
      };
      state.entries.set(key, entry);
      this.deps.store
        .acquire(
          key,
          (signal) =>
            this.deps.fetchTile(
              pon,
              tileEngineRect(grid, page, coord),
              grid.scale,
              includeAnnotations,
              signal,
            ),
          abort.signal,
        )
        .then(
          (handle) => {
            if (state.entries.get(key) !== entry) return; // aborted/superseded
            entry.handle = handle;
            state.version += 1;
            state.planCache = null;
            this.deps.onAdvance(pon);
          },
          () => {
            if (state.entries.get(key) === entry) state.entries.delete(key);
          },
        );
    }
    return allReady;
  }

  /**
   * The release rule: after `painted` lands on a want-level tile, retained
   * sources (any other level) whose footprint ∩ painted-tile region is
   * covered by PAINTED want-level tiles leave the paint list. Index
   * arithmetic via the aligned grid — no rectangle geometry.
   */
  private releaseOccluded(state: PageTileState, painted: TileEntry): void {
    const wantScale = state.wantScale;
    if (wantScale === null || painted.scale !== wantScale) return;
    const page = this.deps.getPageSize(pagePonOf(painted.key));
    if (!page) return;
    const grid = tileGrid(page, wantScale, this.deps.config.tileSize);
    const paintedAt = (c: TileCoord) => {
      const key = this.tileKey(
        pagePonOf(painted.key),
        wantScale,
        c,
        annotationsOf(painted.key),
        state.epoch,
      );
      return state.entries.get(key)?.painted === true;
    };
    for (const [key, entry] of state.entries) {
      if (entry.scale === wantScale || entry.handle === undefined) continue;
      const overlap = intersectRects(entry.rect, painted.rect);
      if (overlap.width <= 0 || overlap.height <= 0) continue;
      // VISIBLE footprint only: an edge parent whose
      // offscreen children were never fetched must still release once its
      // on-screen region is covered — and its bytes stay in the store, so
      // a pan that re-exposes the rest re-promotes from cache.
      const region = state.lastVisible ? intersectRects(entry.rect, state.lastVisible) : entry.rect;
      if (regionCovered(grid, page, region, paintedAt)) {
        state.entries.delete(key);
      }
    }
  }

  private abortAll(state: PageTileState): void {
    if (state.settleTimer !== null) {
      clearTimeout(state.settleTimer);
      state.settleTimer = null;
    }
    for (const entry of state.entries.values()) {
      if (entry.handle === undefined) entry.abort?.abort();
    }
  }

  private tileKey(
    pon: number,
    scale: number,
    c: TileCoord,
    includeAnnotations: boolean,
    epoch: number,
  ): string {
    return `t:${pon}|s${scale}|${c.ix},${c.iy}|a${includeAnnotations ? 1 : 0}|e${epoch}`;
  }
}

interface TileEntry {
  key: string;
  scale: number;
  coord: TileCoord;
  /** y-down page points. */
  rect: Rect;
  handle?: PageImageHandle;
  painted: boolean;
  abort?: AbortController;
}

interface PageTileState {
  epoch: number;
  wantScale: number | null;
  entries: Map<string, TileEntry>;
  /** Bumped on ready/painted/drop — the plan memo key. */
  version: number;
  planCache: { demandKey: string; version: number; plan: TilePaintPlan } | null;
  settleTimer: ReturnType<typeof setTimeout> | null;
  pendingLevel: number | null;
  /** Last visible rect from plan() — the release rule's "on screen". */
  lastVisible: Rect | null;
}

const widthOf = (v: { kind: string; width?: number }): number =>
  v.kind === 'width' && v.width !== undefined ? v.width : Number.POSITIVE_INFINITY;

const coordKey = (c: TileCoord): string => `${c.ix},${c.iy}`;
const rectKey = (r: Rect): string =>
  `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;

/** Stacking: position in the ascending pyramid (coarse under fine). */
const zOf = (pyramid: readonly number[], scale: number): number => {
  const sorted = [...pyramid].sort((a, b) => a - b);
  const idx = sorted.indexOf(scale);
  return idx === -1 ? sorted.findIndex((s) => s > scale) : idx;
};

const pagePonOf = (key: string): number => Number(key.slice(2, key.indexOf('|')));
const annotationsOf = (key: string): boolean => key.includes('|a1|');
