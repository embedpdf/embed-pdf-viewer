import { memo, type EngineRenderPolicy, type PageImageHandle } from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';

import {
  EMPTY_TILE_PLAN,
  type PageViewDemand,
  type ResolvedRenderOptions,
  type TilePaintPlan,
  type TilePaintSource,
} from './paint-plan';
import type { RasterStore } from './raster-store';
import { baseAskWidth, resolveStrategy } from './strategy';
import {
  bleedRect,
  inflateRect,
  intersectRects,
  regionCovered,
  snapToPyramid,
  tileGrid,
  tilesInRect,
  tilePaintRect,
  type PageSizePt,
  type TileCoord,
  type TileGrid,
} from './tiles';

/** One state entry per view of a page (see {@link TileManager}'s `pages`). */
const stateKey = (view: string, pageObjectNumber: number): string =>
  `${view}\u0000${pageObjectNumber}`;

/** Backpressure: raw rasters in flight at once (render + encode transit). */
const MAX_IN_FLIGHT = 8;
/** Stage-less (no visibleRect) demand is capped to this many whole-page tiles. */
const STAGELESS_TILE_CAP = 64;

/**
 * The tile retention state machine. One instance per plugin instance (per
 * document), all levels and pages in one place, over the same RasterStore
 * the base renders use.
 *
 * Invariant it enforces: every screen region paints the sharpest painted
 * pixels available; quality per region only goes up until the want set
 * resolves. Mechanics:
 *   - want vs paint: `plan()` schedules fetches for the want set (visible
 *     tiles first, center-out, then the prefetch ring once every visible
 *     tile resolved) and returns a paint list drawn only from resolved
 *     entries: the current level and retained older generations.
 *   - release-on-occlusion: when a want-level tile reports painted (after the
 *     layer's first presentation opportunity), retained sources whose
 *     visible footprint is covered by painted want tiles leave the paint
 *     list. Their bytes stay in the RasterStore (demotion, not eviction), so
 *     zooming back re-promotes from cache.
 *   - epoch exception: an invalidation bump means retained pixels are
 *     wrong, so everything of the old epoch drops immediately.
 *
 * Levels come from the resolved strategy (policy ∧ options): a pyramid
 * under a lattice (or the opt-in client ladder), the exact settled scale
 * under exact mode, where the level identity is the demand's device width
 * across the page, so keys stay integer and stable. The retention/coverage
 * math is generic over any mix of retained scales.
 *
 * `plan()` never wakes readers itself: its callers do, once, when the
 * returned plan changed. Fetch kickoff is idempotent (the store
 * singleflights); resolution handlers call `onAdvance`, which re-plans the
 * page and wakes subscribed layers.
 */
export class TileManager {
  /**
   * Tile state is per view-of-page, never per page: a document may be shown
   * through several lenses at once (the main view, a thumbnail rail), each
   * calling `plan` with its own demand. One shared entry would let the
   * rail's below-engage demand hit the disengage branch and destroy the
   * main view's tiles on every re-plan (the sidebar opens and the main view
   * goes blurry). Keyed by {@link stateKey}; the RasterStore underneath
   * stays shared — bytes dedupe across views by conformed width.
   */
  private readonly pages = new Map<string, PageTileState>();
  /** The resolved strategy, recomputed when the policy reference changes. */
  private readonly strategy = memo(
    () => [this.deps.getPolicy()],
    (policy) => resolveStrategy(policy, this.deps.options),
  );
  /** Live fetches across all pages — the backpressure counter. */
  private inFlight = 0;
  private warnedStageless = false;

  constructor(
    private readonly deps: {
      store: RasterStore;
      options: ResolvedRenderOptions;
      /** The document fact off the kernel registry — never null: the kernel
       *  materializes it (continuous fallback) before the doc publishes. */
      getPolicy(): EngineRenderPolicy;
      getPageSize(pageObjectNumber: number): PageSizePt | undefined;
      getEpoch(pageObjectNumber: number, includeAnnotations: boolean): number;
      /** Render a page-space (y-down page points) region; the owner converts to PDF space. */
      fetchTile(
        pageObjectNumber: number,
        rect: Rect,
        scale: number,
        includeAnnotations: boolean,
        signal: AbortSignal,
      ): Promise<PageImageHandle>;
      /** A page's plans changed outside `plan()`: re-plan it and wake subscribed layers. */
      onAdvance(pageObjectNumber: number): void;
      /** Diagnostic sink (options.debug) — scheduling and fetch outcomes. */
      debug?(message: string): void;
    },
  ) {}

  plan(
    view: string,
    pageObjectNumber: number,
    demand: PageViewDemand,
    includeAnnotations: boolean,
  ): TilePaintPlan {
    const { options } = this.deps;
    if (!options.tiles.enabled) return EMPTY_TILE_PLAN;
    const strategy = this.strategy();
    const page = this.deps.getPageSize(pageObjectNumber);
    if (!page) return EMPTY_TILE_PLAN;

    const epoch = this.deps.getEpoch(pageObjectNumber, includeAnnotations);
    const state = this.pageState(pageObjectNumber, view);

    // Epoch exception: old-epoch pixels are wrong, not blurry — drop all.
    if (state.epoch !== epoch) {
      this.abortAll(state);
      state.entries.clear();
      state.failedKeys.clear();
      state.epoch = epoch;
      state.wantScale = null;
      state.wantWidth = null;
      state.planCache = null;
    }

    // Engagement: deficit of what the base actually supplies vs demand —
    // the same `baseAskWidth` the base layer sizes with, so local and cloud run
    // the identical arithmetic. Exact mode engages at 1.0 (nothing may rest
    // stretched past the budget); a lattice tolerates its band.
    const supplied = baseAskWidth(strategy, demand.desiredDeviceWidth);
    const deficit = demand.desiredDeviceWidth / supplied;
    if (deficit <= strategy.engageAt) {
      // Disengage drops bookkeeping immediately; resolved bytes stay in the
      // RasterStore, so a re-engage promotes from cache — and below the
      // threshold the base itself is crisp, so nothing visible is lost.
      if (state.entries.size || state.wantScale !== null) {
        this.deps.debug?.(`disengage page=${pageObjectNumber} (deficit ${deficit.toFixed(2)})`);
        this.abortAll(state);
        state.entries.clear();
        state.failedKeys.clear();
        state.wantScale = null;
        state.wantWidth = null;
        state.planCache = null;
      }
      return EMPTY_TILE_PLAN;
    }

    // Level selection. Pyramid mode snaps up the ladder; exact mode renders
    // the demand itself (clamped by the safety cap), with the level identity
    // being the integer device width across the page.
    let wantWidth: number;
    let wantScale: number;
    if (strategy.pyramid) {
      wantScale = snapToPyramid(strategy.pyramid, demand.desiredDeviceWidth / page.width);
      wantWidth = Math.round(wantScale * page.width);
    } else {
      wantWidth = Math.min(
        Math.max(1, Math.round(demand.desiredDeviceWidth)),
        Math.round(strategy.tileMaxScale * page.width),
      );
      wantScale = wantWidth / page.width;
    }

    // Stage-less demand (no visibleRect) means the whole page tiles at the
    // want level — unbounded at deep zoom (a 4,650% page is ~28,000 tiles).
    // Clamp the level so the whole-page tile count stays bounded: the lens
    // degrades to bounded sharpness instead of unbounded memory, consistent
    // with the budget philosophy everywhere else. Hosts that want true deep
    // zoom supply a visibleRect (the Stage does).
    if (!demand.visibleRect) {
      const maxStagelessWidth = Math.max(
        strategy.tileSize,
        Math.floor(strategy.tileSize * Math.sqrt((STAGELESS_TILE_CAP * page.width) / page.height)),
      );
      if (wantWidth > maxStagelessWidth) {
        if (!this.warnedStageless) {
          this.warnedStageless = true;
          console.warn(
            `[render] stage-less tile demand of ${Math.round(demand.desiredDeviceWidth)} device px ` +
              `would tile the whole page — clamped to ${maxStagelessWidth}. Supply a visibleRect ` +
              `(host the page in a Stage) for sharp deep zoom.`,
          );
        }
        if (strategy.pyramid) {
          const fitting = strategy.pyramid.filter(
            (scale) => Math.round(scale * page.width) <= maxStagelessWidth,
          );
          wantScale = fitting.length ? fitting[fitting.length - 1]! : strategy.pyramid[0]!;
          wantWidth = Math.round(wantScale * page.width);
        } else {
          wantWidth = maxStagelessWidth;
          wantScale = wantWidth / page.width;
        }
      }
    }
    const grid = tileGrid(page, wantScale, strategy.tileSize);

    const visible = demand.visibleRect ?? { x: 0, y: 0, width: page.width, height: page.height };
    state.lastVisible = visible;
    const visibleCoords = tilesInRect(grid, page, visible);
    const ring = inflateRect(
      visible,
      options.tiles.prefetchMargin,
      options.tiles.velocityBias ? demand.velocity : undefined,
    );
    const visibleKeys = new Set(visibleCoords.map((coord) => coordKey(coord)));
    const prefetchCoords = tilesInRect(grid, page, ring).filter(
      (coord) => !visibleKeys.has(coordKey(coord)),
    );

    this.schedule(
      pageObjectNumber,
      state,
      page,
      grid,
      wantScale,
      wantWidth,
      includeAnnotations,
      epoch,
      visibleCoords,
      prefetchCoords,
      visible,
    );

    // Release retained generations covered by the current painted set —
    // evaluated here, not only on painted reports, so release can never be
    // stranded by report ordering.
    if (this.releaseCovered(pageObjectNumber, state, page, includeAnnotations)) {
      state.version += 1;
      state.planCache = null;
    }

    // Paint list: resolved entries intersecting the visible rect, coarser
    // levels first (painter's algorithm — sharper occludes per region).
    // The memo key holds the level identity (integer width) — zoom inside a
    // pyramid rung is plan-stable by construction; exact mode re-plans per
    // settled level, which the schedule gate keeps rare.
    const demandKey = `w${wantWidth}|${rectKey(visible)}|e${epoch}`;
    if (
      state.planCache &&
      state.planCache.demandKey === demandKey &&
      state.planCache.version === state.version
    ) {
      return state.planCache.plan;
    }
    const paint: TilePaintSource[] = [];
    const fetching: string[] = [];
    const stale: string[] = [];
    const bleedPx = this.deps.options.tiles.bleedPx;
    for (const entry of state.entries.values()) {
      const visiblePart = intersectRects(entry.rect, visible);
      if (entry.resolved) {
        if (visiblePart.width > 0 && visiblePart.height > 0) {
          // Ownership: bytes live in the RasterStore alone; the manager
          // holds keys. Peek resolves the handle at paint time — an entry
          // whose bytes were evicted is simply no longer resolved (dropped
          // here; re-fetched on the next pass if still wanted).
          const handle = this.deps.store.peek(entry.key);
          if (!handle) {
            stale.push(entry.key);
            continue;
          }
          paint.push({
            key: entry.key,
            scale: entry.scale,
            // The placement rect is the bled one — it matches the bitmap the
            // fetch rendered. Retention/coverage math stays on the logical
            // (unbled) `entry.rect`; the overlap strips duplicate the
            // neighbor's content, so painting them is what kills the seams.
            rect: bleedPx > 0 ? bleedRect(entry.rect, bleedPx / entry.scale, page) : entry.rect,
            z: 0, // ranked below — stacking is scale order among present entries
            handle,
          });
        }
      } else if (entry.scale === wantScale) {
        fetching.push(entry.key);
      }
    }
    for (const key of stale) state.entries.delete(key);
    // Stacking: rank the scales actually present (generic over exact levels
    // and pyramid rungs alike) — coarse under fine.
    const rank = new Map<number, number>();
    const scales = [...new Set(paint.map((source) => source.scale))];
    for (const scale of scales.sort((left, right) => left - right)) rank.set(scale, rank.size);
    for (const source of paint) source.z = rank.get(source.scale)!;
    paint.sort((left, right) => left.z - right.z || left.key.localeCompare(right.key));
    const plan: TilePaintPlan = {
      engaged: true,
      paint,
      fetching: fetching.sort(),
      stamp: `${demandKey}|v${state.version}`,
    };
    state.planCache = { demandKey, version: state.version, plan };
    return plan;
  }

  /** The layer's painted report: this key's pixels had a presentation opportunity. */
  sourcePainted(view: string, pageObjectNumber: number, key: string): void {
    const state = this.pages.get(stateKey(view, pageObjectNumber));
    const entry = state?.entries.get(key);
    if (!state || !entry || entry.painted) return;
    entry.painted = true;
    const page = this.deps.getPageSize(pageObjectNumber);
    if (page) this.releaseCovered(pageObjectNumber, state, page, annotationsOf(key));
    state.version += 1;
    state.planCache = null;
    this.deps.onAdvance(pageObjectNumber);
  }

  /**
   * The inverse report: this key's <img> left the DOM (pan-away, plan drop),
   * so its pixels are not currently compositable. Without this, a tile that
   * unmounts and later remounts is still counted as painted while its new
   * <img> re-decodes — and an adjacent fresh `sourcePainted` could release
   * retained coarse coverage over a region that momentarily has no sharp
   * pixels. Painted is a statement about the screen, so it follows the DOM.
   */
  sourceUnpainted(view: string, pageObjectNumber: number, key: string): void {
    const entry = this.pages.get(stateKey(view, pageObjectNumber))?.entries.get(key);
    if (entry) entry.painted = false;
  }

  /** A lens unmounted its tile plane: stop fetching, drop bookkeeping.
   *  Resolved bytes stay in the RasterStore for a re-mount. */
  releasePage(view: string, pageObjectNumber: number): void {
    const state = this.pages.get(stateKey(view, pageObjectNumber));
    if (!state) return;
    this.abortAll(state);
    this.pages.delete(stateKey(view, pageObjectNumber));
  }

  private pageState(pageObjectNumber: number, view: string): PageTileState {
    let state = this.pages.get(stateKey(view, pageObjectNumber));
    if (!state) {
      state = {
        epoch: -1,
        wantScale: null,
        wantWidth: null,
        entries: new Map(),
        failedKeys: new Set(),
        version: 0,
        planCache: null,
        settleTimer: null,
        pendingLevel: null,
        lastVisible: null,
      };
      this.pages.set(stateKey(view, pageObjectNumber), state);
    }
    return state;
  }

  private schedule(
    pageObjectNumber: number,
    state: PageTileState,
    page: PageSizePt,
    grid: TileGrid,
    wantScale: number,
    wantWidth: number,
    includeAnnotations: boolean,
    epoch: number,
    visibleCoords: TileCoord[],
    prefetchCoords: TileCoord[],
    visible: Rect,
  ): void {
    const { options } = this.deps;
    const firstEngage = state.wantWidth === null;
    const levelChanged = state.wantWidth !== null && state.wantWidth !== wantWidth;
    if (levelChanged) state.failedKeys.clear(); // a new level gets fresh chances
    state.wantScale = wantScale;
    state.wantWidth = wantWidth;

    // Entries follow the want set. In-flight fetches that left it abort;
    // resolved same-level tiles that left it are dropped — their bytes stay
    // in the RasterStore's LRU, so a pan-back re-promotes from cache
    // instead of re-rendering. Only cross-level retained entries stay, and
    // those are the release rules' business. Without this, panning at deep
    // zoom accumulates every tile ever visited.
    const wanted = new Set(
      [...visibleCoords, ...prefetchCoords].map((coord) =>
        this.tileKey(pageObjectNumber, wantWidth, coord, includeAnnotations, epoch),
      ),
    );
    for (const [key, entry] of state.entries) {
      if (wanted.has(key)) continue;
      if (!entry.resolved) {
        entry.abort?.abort();
        // The transit slot frees now, synchronously — the rejection handler
        // runs a microtask later, and fetches started in this plan must see
        // the freed capacity.
        this.releaseSlot(entry);
        state.entries.delete(key);
      } else if (entry.scale === wantScale) {
        state.entries.delete(key);
      }
    }

    // Center-out: the region under the user's gesture sharpens first.
    const centerX = visible.x + visible.width / 2;
    const centerY = visible.y + visible.height / 2;
    const span = grid.tileSize / grid.scale;
    const distanceToCenter = (coord: TileCoord): number => {
      const dx = (coord.ix + 0.5) * span - centerX;
      const dy = (coord.iy + 0.5) * span - centerY;
      return dx * dx + dy * dy;
    };
    const orderedVisible = [...visibleCoords].sort(
      (left, right) => distanceToCenter(left) - distanceToCenter(right),
    );

    const kickoff = () => {
      const allVisibleReady = this.ensureFetches(
        pageObjectNumber,
        state,
        page,
        grid,
        wantWidth,
        includeAnnotations,
        epoch,
        orderedVisible,
      );
      // The prefetch ring strictly after the visible tiles: prefetch never
      // competes with on-screen tiles.
      if (allVisibleReady) {
        this.ensureFetches(
          pageObjectNumber,
          state,
          page,
          grid,
          wantWidth,
          includeAnnotations,
          epoch,
          prefetchCoords,
        );
      }
    };

    // Level-change settle: a zoom in motion shouldn't fetch each
    // intermediate level (under exact mode every gesture frame is a new
    // level — this gate is what makes exact affordable). First engagement
    // fires immediately — there's nothing on screen above the base yet.
    if (levelChanged && options.tiles.settleMs > 0) {
      this.deps.debug?.(`arm settle page=${pageObjectNumber} level=${wantWidth}`);
      state.pendingLevel = wantWidth;
      if (state.settleTimer !== null) clearTimeout(state.settleTimer);
      state.settleTimer = setTimeout(() => {
        state.settleTimer = null;
        this.deps.debug?.(
          `settle fired page=${pageObjectNumber} level=${wantWidth} ` +
            `current=${state.pendingLevel === wantWidth}`,
        );
        if (state.pendingLevel === wantWidth) kickoff();
      }, options.tiles.settleMs);
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
    pageObjectNumber: number,
    state: PageTileState,
    page: PageSizePt,
    grid: TileGrid,
    wantWidth: number,
    includeAnnotations: boolean,
    epoch: number,
    coords: TileCoord[],
  ): boolean {
    let allReady = true;
    let started = 0;
    const bleedPt = this.deps.options.tiles.bleedPx / grid.scale;
    for (const coord of coords) {
      const key = this.tileKey(pageObjectNumber, wantWidth, coord, includeAnnotations, epoch);
      // A key that failed (non-abort) at this level is not retried until the
      // level or epoch changes — retrying every plan would loop on a
      // permanent error. The base shows through the hole; degraded, honest.
      if (state.failedKeys.has(key)) continue;
      const existing = state.entries.get(key);
      if (existing) {
        if (!existing.resolved) allReady = false;
        continue;
      }
      allReady = false;
      // Backpressure: bound raw rasters in transit (render + encode). The
      // wake → plan → ensureFetches loop is the pump — each resolution
      // replans and starts the next batch; no queue machinery needed.
      if (this.inFlight >= MAX_IN_FLIGHT) continue;
      this.inFlight += 1;
      started += 1;
      const abort = new AbortController();
      const logical = tilePaintRect(grid, page, coord);
      const entry: TileEntry = {
        key,
        scale: grid.scale,
        coord,
        rect: logical,
        resolved: false,
        painted: false,
        charged: true,
        abort,
      };
      state.entries.set(key, entry);
      this.deps.store
        .acquire(
          key,
          (signal) =>
            this.deps.fetchTile(
              pageObjectNumber,
              // The rendered region is the bled rect — it matches the bled
              // placement rect the paint list emits for this entry.
              bleedPt > 0 ? bleedRect(logical, bleedPt, page) : logical,
              grid.scale,
              includeAnnotations,
              signal,
            ),
          abort.signal,
        )
        .then(
          () => {
            this.releaseSlot(entry);
            if (state.entries.get(key) !== entry) return; // aborted/superseded
            // The handle stays in the store (single ownership) — the paint
            // list peeks it back out; this entry just records success.
            entry.resolved = true;
            state.version += 1;
            state.planCache = null;
            this.deps.onAdvance(pageObjectNumber);
          },
          (error) => {
            this.releaseSlot(entry);
            if (state.entries.get(key) !== entry) return;
            state.entries.delete(key);
            // Our own abort (pan-away, level change) is expected silence. A
            // real failure marks the key and wakes the layers: the paint
            // plan recomputes so the rest of the want set keeps making
            // progress instead of waiting on a resolution that never comes.
            if (!abort.signal.aborted) {
              state.failedKeys.add(key);
              this.deps.debug?.(`tile failed ${key}: ${String(error)}`);
              state.version += 1;
              state.planCache = null;
              this.deps.onAdvance(pageObjectNumber);
            }
          },
        );
    }
    if (started > 0) {
      this.deps.debug?.(`fetch page=${pageObjectNumber} level=${wantWidth} +${started} tiles`);
    }
    return allReady;
  }

  /**
   * The release rule, evaluated as a pure function of the current painted
   * set: retained sources (any non-want level) whose visible footprint is
   * covered by painted want-level tiles leave the paint list. Runs on every
   * `plan()` and on every painted report — never only "against the tile
   * that just painted": release must not depend on paint order (center-out
   * scheduling means the report that completes a retained tile's coverage
   * routinely lands far away from it), and re-evaluating from current state
   * also self-heals any painted-flag transition the reports raced past.
   * Coverage is index arithmetic over the want grid — generic over whatever
   * mix of retained scales exists (exact levels included).
   */
  private releaseCovered(
    pageObjectNumber: number,
    state: PageTileState,
    page: PageSizePt,
    includeAnnotations: boolean,
  ): boolean {
    const { wantScale, wantWidth } = state;
    if (wantScale === null || wantWidth === null) return false;
    const grid = tileGrid(page, wantScale, this.strategy().tileSize);
    const wantKeyOf = (coord: TileCoord) =>
      this.tileKey(pageObjectNumber, wantWidth, coord, includeAnnotations, state.epoch);
    const paintedAt = (coord: TileCoord) => state.entries.get(wantKeyOf(coord))?.painted === true;
    let released = false;
    for (const [key, entry] of state.entries) {
      if (entry.scale === wantScale || !entry.resolved) continue;
      // Visible footprint only: an edge parent whose offscreen children
      // were never fetched must still release once its on-screen region is
      // covered, and its bytes stay in the store, so a pan that re-exposes
      // the rest re-promotes from cache.
      const region = state.lastVisible ? intersectRects(entry.rect, state.lastVisible) : entry.rect;
      if (regionCovered(grid, page, region, paintedAt)) {
        state.entries.delete(key);
        released = true;
      } else if (this.deps.debug) {
        const missing = tilesInRect(grid, page, region).filter((coord) => !paintedAt(coord));
        const detail = missing.slice(0, 3).map((coord) => {
          const missingEntry = state.entries.get(wantKeyOf(coord));
          const status = !missingEntry
            ? 'NO-ENTRY'
            : !missingEntry.resolved
              ? 'PENDING'
              : 'RESOLVED-unpainted';
          return `${coord.ix},${coord.iy}=${status}`;
        });
        this.deps.debug(
          `retained ${key} blocked by: ${detail.join(' ')} (${missing.length} missing)`,
        );
      }
    }
    return released;
  }

  /** Test/diagnostic introspection: bookkeeping size for one page. */
  stats(view: string, pageObjectNumber: number): { entries: number; inFlight: number } {
    return {
      entries: this.pages.get(stateKey(view, pageObjectNumber))?.entries.size ?? 0,
      inFlight: this.inFlight,
    };
  }

  /** Idempotent transit-slot release — the one place inFlight decrements. */
  private releaseSlot(entry: TileEntry): void {
    if (!entry.charged) return;
    entry.charged = false;
    this.inFlight -= 1;
  }

  private abortAll(state: PageTileState): void {
    if (state.settleTimer !== null) {
      clearTimeout(state.settleTimer);
      state.settleTimer = null;
    }
    for (const entry of state.entries.values()) {
      if (!entry.resolved) {
        entry.abort?.abort();
        this.releaseSlot(entry);
      }
    }
  }

  /** Level identity is the integer device width across the page — integer
   *  and stable for pyramid rungs and exact levels alike. The key also
   *  carries everything that determines the fetched bitmap for a coord
   *  (tile size, bleed, encode format): a raster's identity must include
   *  its geometry, or a cached handle from one configuration could be
   *  stretched into another's rect. Format genuinely varies at runtime —
   *  the cloud policy arrives async after open and can change the resolved
   *  format under a live store. */
  private tileKey(
    pageObjectNumber: number,
    levelWidth: number,
    coord: TileCoord,
    includeAnnotations: boolean,
    epoch: number,
  ): string {
    const { tiles } = this.deps.options;
    const format = this.strategy().format;
    const geometry = `g${tiles.size}.${tiles.bleedPx}${format ? `.${format}` : ''}`;
    return (
      `t:${pageObjectNumber}|w${levelWidth}|${coord.ix},${coord.iy}` +
      `|a${includeAnnotations ? 1 : 0}|e${epoch}|${geometry}`
    );
  }
}

interface TileEntry {
  key: string;
  scale: number;
  coord: TileCoord;
  /** y-down page points. */
  rect: Rect;
  /** Fetch completed — the bytes live in the RasterStore (peeked at paint
   *  time), never here: single ownership is what makes the store's budget
   *  the actual bound on residency. */
  resolved: boolean;
  painted: boolean;
  /** Holds an in-flight transit slot (see releaseSlot — idempotent). */
  charged?: boolean;
  abort?: AbortController;
}

interface PageTileState {
  epoch: number;
  wantScale: number | null;
  /** The want level's identity: integer device px across the page. */
  wantWidth: number | null;
  entries: Map<string, TileEntry>;
  /** Keys that failed (non-abort) at the current level — not retried until
   *  the level or epoch changes. */
  failedKeys: Set<string>;
  /** Bumped on ready/painted/drop; part of the paint-plan memo key. */
  version: number;
  planCache: { demandKey: string; version: number; plan: TilePaintPlan } | null;
  settleTimer: ReturnType<typeof setTimeout> | null;
  /** Pending level identity (wantWidth) while the settle gate runs. */
  pendingLevel: number | null;
  /** Last visible rect from plan() — the release rule's "on screen". */
  lastVisible: Rect | null;
}

const coordKey = (coord: TileCoord): string => `${coord.ix},${coord.iy}`;
const rectKey = (rect: Rect): string =>
  `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;

const annotationsOf = (key: string): boolean => key.includes('|a1|');
