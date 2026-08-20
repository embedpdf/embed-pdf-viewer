import type { EngineRenderPolicy, PageImageHandle, PdfRect } from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';

import {
  EMPTY_TILE_PLAN,
  type PageViewDemand,
  type ResolvedRenderOptions,
  type TilePaintPlan,
  type TilePaintSource,
} from './paint-plan';
import type { RasterStore } from './raster-store';
import { baseAskWidth, resolveStrategy, type ResolvedStrategy } from './strategy';
import {
  bleedRect,
  inflateRect,
  intersectRects,
  regionCovered,
  snapToPyramid,
  tileGrid,
  tilesInRect,
  tilePaintRect,
  toEngineRect,
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
 *     visible first — center-out — then P1 prefetch when P0 is fully
 *     resolved) and returns a paint list drawn ONLY from resolved entries —
 *     current level AND retained older generations.
 *   - release-on-occlusion: when a want-level tile reports PAINTED (after the
 *     layer's first presentation opportunity), retained sources whose
 *     visible footprint is
 *     covered by painted want tiles leave the paint list. Their bytes stay
 *     in the RasterStore (demotion, not eviction) — zoom-back re-promotes
 *     from cache.
 *   - epoch exception: an invalidation bump means retained pixels are
 *     WRONG — everything of the old epoch drops immediately.
 *
 * Levels come from the resolved STRATEGY (policy ∧ options): a pyramid
 * under a lattice (or the opt-in client ladder), the EXACT settled scale
 * under exact mode — where the level identity is the demand's device width
 * across the page, so keys stay integer and stable. The retention/coverage
 * math is generic over any mix of retained scales.
 *
 * `plan()` is called from selectors: it MUST NOT dispatch. Fetch kickoff
 * is idempotent (the store singleflights); resolution handlers dispatch
 * the wake-up (`onAdvance`) that makes subscribed layers recompute.
 */
/** Backpressure: raw rasters in flight at once (render + encode transit). */
const MAX_IN_FLIGHT = 8;
/** Stage-less (no visibleRect) demand is capped to this many whole-page tiles. */
const STAGELESS_TILE_CAP = 64;

export class TileManager {
  private readonly pages = new Map<number, PageTileState>();
  private strategyMemo: { policy: EngineRenderPolicy; strategy: ResolvedStrategy } | null = null;
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
      /** Diagnostic sink (options.debug) — scheduling and fetch outcomes. */
      debug?(msg: string): void;
    },
  ) {}

  private strategy(): ResolvedStrategy {
    const policy = this.deps.getPolicy();
    if (this.strategyMemo?.policy !== policy) {
      this.strategyMemo = { policy, strategy: resolveStrategy(policy, this.deps.options) };
    }
    return this.strategyMemo.strategy;
  }

  plan(pon: number, demand: PageViewDemand, includeAnnotations: boolean): TilePaintPlan {
    const { options } = this.deps;
    if (!options.tiles.enabled) return EMPTY_TILE_PLAN;
    const strategy = this.strategy();
    const page = this.deps.getPageSize(pon);
    if (!page) return EMPTY_TILE_PLAN;

    const epoch = this.deps.getEpoch(pon, includeAnnotations);
    const state = this.pageState(pon);

    // Epoch exception: old-epoch pixels are WRONG, not blurry — drop all.
    if (state.epoch !== epoch) {
      this.abortAll(state);
      state.entries.clear();
      state.failedKeys.clear();
      state.epoch = epoch;
      state.wantScale = null;
      state.wantWidth = null;
      state.planCache = null;
    }

    // Engagement: deficit of what the base ACTUALLY supplies vs demand —
    // the same `baseAsk` the base layer sizes with, so local and cloud run
    // the identical arithmetic. Exact mode engages at 1.0 (nothing may rest
    // stretched past the budget); a lattice tolerates its band.
    const supplied = baseAskWidth(strategy, demand.desiredDeviceWidth);
    const deficit = demand.desiredDeviceWidth / supplied;
    if (deficit <= strategy.engageAt) {
      // Disengage drops bookkeeping immediately; resolved bytes stay in the
      // RasterStore, so a re-engage promotes from cache — and below the
      // threshold the base itself is crisp, so nothing visible is lost.
      if (state.entries.size || state.wantScale !== null) {
        this.deps.debug?.(`disengage pon=${pon} (deficit ${deficit.toFixed(2)})`);
        this.abortAll(state);
        state.entries.clear();
        state.failedKeys.clear();
        state.wantScale = null;
        state.wantWidth = null;
        state.planCache = null;
      }
      return EMPTY_TILE_PLAN;
    }

    // Level selection. Pyramid mode snaps UP the ladder; exact mode renders
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

    // STAGE-LESS demand (no visibleRect) means the WHOLE page tiles at the
    // want level — unbounded at deep zoom (a 4,650% page is ~28,000 tiles).
    // Clamp the level so the whole-page tile count stays bounded: the lens
    // degrades to bounded sharpness instead of unbounded memory, consistent
    // with the budget philosophy everywhere else. Hosts that want true deep
    // zoom supply a visibleRect (the Stage does).
    if (!demand.visibleRect) {
      const maxStagelessWidth = Math.max(
        strategy.tileSize,
        Math.floor(
          strategy.tileSize * Math.sqrt((STAGELESS_TILE_CAP * page.width) / page.height),
        ),
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
            (s) => Math.round(s * page.width) <= maxStagelessWidth,
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
    const p0 = tilesInRect(grid, page, visible);
    const ring = inflateRect(
      visible,
      options.tiles.prefetchMargin,
      options.tiles.velocityBias ? demand.velocity : undefined,
    );
    const p0Keys = new Set(p0.map((c) => coordKey(c)));
    const p1 = tilesInRect(grid, page, ring).filter((c) => !p0Keys.has(coordKey(c)));

    this.schedule(
      pon,
      state,
      page,
      grid,
      wantScale,
      wantWidth,
      includeAnnotations,
      epoch,
      p0,
      p1,
      visible,
    );

    // Release retained generations covered by the CURRENT painted set —
    // evaluated here, not only on painted reports, so release can never be
    // stranded by report ordering.
    if (this.releaseCovered(pon, state, page, includeAnnotations)) {
      state.version += 1;
      state.planCache = null;
    }

    // Paint list: resolved entries intersecting the visible rect, coarser
    // levels first (painter's algorithm — sharper occludes per region).
    // The memo key holds the LEVEL identity (integer width) — zoom inside a
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
      const visIntersect = intersectRects(entry.rect, visible);
      if (entry.resolved) {
        if (visIntersect.width > 0 && visIntersect.height > 0) {
          // OWNERSHIP: bytes live in the RasterStore alone; the manager
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
            // The PLACEMENT rect is the bled one — it matches the bitmap the
            // fetch rendered. Retention/coverage math stays on the logical
            // (unbled) `entry.rect`; the overlap strips duplicate the
            // neighbor's content, so painting them is what kills the seams.
            rect: bleedPx > 0 ? bleedRect(entry.rect, bleedPx / entry.scale, page) : entry.rect,
            z: 0, // ranked below — stacking is scale order among PRESENT entries
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
    for (const s of [...new Set(paint.map((p) => p.scale))].sort((a, b) => a - b)) {
      rank.set(s, rank.size);
    }
    for (const p of paint) p.z = rank.get(p.scale)!;
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

  /** The layer's painted report: this key's pixels had a presentation opportunity. */
  sourcePainted(pon: number, key: string): void {
    const state = this.pages.get(pon);
    const entry = state?.entries.get(key);
    if (!state || !entry || entry.painted) return;
    entry.painted = true;
    const page = this.deps.getPageSize(pon);
    if (page) this.releaseCovered(pon, state, page, annotationsOf(key));
    state.version += 1;
    state.planCache = null;
    this.deps.onAdvance(pon);
  }

  /**
   * The inverse report: this key's <img> left the DOM (pan-away, plan drop),
   * so its pixels are NOT currently compositable. Without this, a tile that
   * unmounts and later remounts is still counted as painted while its new
   * <img> re-decodes — and an adjacent fresh `sourcePainted` could release
   * retained coarse coverage over a region that momentarily has no sharp
   * pixels. Painted is a statement about the SCREEN, so it follows the DOM.
   */
  sourceUnpainted(pon: number, key: string): void {
    const entry = this.pages.get(pon)?.entries.get(key);
    if (entry) entry.painted = false;
  }

  /** A lens unmounted its tile plane: stop fetching, drop bookkeeping.
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
        wantWidth: null,
        entries: new Map(),
        failedKeys: new Set(),
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
    wantWidth: number,
    includeAnnotations: boolean,
    epoch: number,
    p0: TileCoord[],
    p1: TileCoord[],
    visible: Rect,
  ): void {
    const { options } = this.deps;
    const firstEngage = state.wantWidth === null;
    const levelChanged = state.wantWidth !== null && state.wantWidth !== wantWidth;
    if (levelChanged) state.failedKeys.clear(); // a new level gets fresh chances
    state.wantScale = wantScale;
    state.wantWidth = wantWidth;

    // Entries FOLLOW the want set. In-flight fetches that left it abort;
    // resolved SAME-LEVEL tiles that left it are dropped — their bytes stay
    // in the RasterStore's LRU, so a pan-back re-promotes from cache
    // instead of re-rendering. Only cross-level RETAINED entries stay, and
    // those are the release rules' business. Without this, panning at deep
    // zoom accumulates every tile ever visited.
    const wanted = new Set(
      [...p0, ...p1].map((c) => this.tileKey(pon, wantWidth, c, includeAnnotations, epoch)),
    );
    for (const [key, entry] of state.entries) {
      if (wanted.has(key)) continue;
      if (!entry.resolved) {
        entry.abort?.abort();
        // The transit slot frees NOW, synchronously — the rejection handler
        // runs a microtask later, and fetches started in THIS plan must see
        // the freed capacity.
        this.releaseSlot(entry);
        state.entries.delete(key);
      } else if (entry.scale === wantScale) {
        state.entries.delete(key);
      }
    }

    // Center-out: the region under the user's gesture sharpens first.
    const cx = visible.x + visible.width / 2;
    const cy = visible.y + visible.height / 2;
    const span = grid.tileSize / grid.scale;
    const orderedP0 = [...p0].sort((a, b) => {
      const da = (a.ix + 0.5) * span - cx;
      const db = (b.ix + 0.5) * span - cx;
      const ea = (a.iy + 0.5) * span - cy;
      const eb = (b.iy + 0.5) * span - cy;
      return da * da + ea * ea - (db * db + eb * eb);
    });

    const kickoff = () => {
      const allP0Ready = this.ensureFetches(
        pon,
        state,
        page,
        grid,
        wantWidth,
        includeAnnotations,
        epoch,
        orderedP0,
      );
      // P1 strictly after P0: prefetch never competes with on-screen tiles.
      if (allP0Ready) {
        this.ensureFetches(pon, state, page, grid, wantWidth, includeAnnotations, epoch, p1);
      }
    };

    // Level-change settle: a zoom IN MOTION shouldn't fetch each
    // intermediate level (under exact mode every gesture frame is a new
    // level — this gate is what makes exact affordable). First engagement
    // fires immediately — there's nothing on screen above the base yet.
    if (levelChanged && options.tiles.settleMs > 0) {
      this.deps.debug?.(`arm settle pon=${pon} level=${wantWidth}`);
      state.pendingLevel = wantWidth;
      if (state.settleTimer !== null) clearTimeout(state.settleTimer);
      state.settleTimer = setTimeout(() => {
        state.settleTimer = null;
        this.deps.debug?.(
          `settle fired pon=${pon} level=${wantWidth} current=${state.pendingLevel === wantWidth}`,
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
    pon: number,
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
      const key = this.tileKey(pon, wantWidth, coord, includeAnnotations, epoch);
      // A key that FAILED (non-abort) at this level is not retried until the
      // level or epoch changes — retrying every plan would loop on a
      // permanent error. The base shows through the hole; degraded, honest.
      if (state.failedKeys.has(key)) continue;
      const existing = state.entries.get(key);
      if (existing) {
        if (!existing.resolved) allReady = false;
        continue;
      }
      allReady = false;
      // BACKPRESSURE: bound raw rasters in transit (render + encode). The
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
              pon,
              // The RENDERED region is the bled rect — it matches the bled
              // placement rect the paint list emits for this entry.
              toEngineRect(page, bleedPt > 0 ? bleedRect(logical, bleedPt, page) : logical),
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
            // The handle stays in the STORE (single ownership) — the paint
            // list peeks it back out; this entry just records success.
            entry.resolved = true;
            state.version += 1;
            state.planCache = null;
            this.deps.onAdvance(pon);
          },
          (err) => {
            this.releaseSlot(entry);
            if (state.entries.get(key) !== entry) return;
            state.entries.delete(key);
            // Our own abort (pan-away, level change) is expected silence. A
            // real failure marks the key and WAKES the layers — the plan
            // recomputes so the rest of the want set keeps making progress
            // instead of waiting on a resolution that will never come.
            if (!abort.signal.aborted) {
              state.failedKeys.add(key);
              this.deps.debug?.(`tile failed ${key}: ${String(err)}`);
              state.version += 1;
              state.planCache = null;
              this.deps.onAdvance(pon);
            }
          },
        );
    }
    if (started > 0) this.deps.debug?.(`fetch pon=${pon} level=${wantWidth} +${started} tiles`);
    return allReady;
  }

  /**
   * The release rule, evaluated as a PURE FUNCTION of the current painted
   * set: retained sources (any non-want level) whose VISIBLE footprint is
   * covered by PAINTED want-level tiles leave the paint list. Runs on every
   * `plan()` and on every painted report — never only "against the tile
   * that just painted": release must not depend on paint ORDER (center-out
   * scheduling means the report that completes a retained tile's coverage
   * routinely lands far away from it), and re-evaluating from current state
   * also self-heals any painted-flag transition the reports raced past.
   * Coverage is index arithmetic over the WANT grid — generic over whatever
   * mix of retained scales exists (exact levels included).
   */
  private releaseCovered(
    pon: number,
    state: PageTileState,
    page: PageSizePt,
    includeAnnotations: boolean,
  ): boolean {
    const { wantScale, wantWidth } = state;
    if (wantScale === null || wantWidth === null) return false;
    const grid = tileGrid(page, wantScale, this.strategy().tileSize);
    const paintedAt = (c: TileCoord) => {
      const key = this.tileKey(pon, wantWidth, c, includeAnnotations, state.epoch);
      return state.entries.get(key)?.painted === true;
    };
    let released = false;
    for (const [key, entry] of state.entries) {
      if (entry.scale === wantScale || !entry.resolved) continue;
      // VISIBLE footprint only: an edge parent whose
      // offscreen children were never fetched must still release once its
      // on-screen region is covered — and its bytes stay in the store, so
      // a pan that re-exposes the rest re-promotes from cache.
      const region = state.lastVisible ? intersectRects(entry.rect, state.lastVisible) : entry.rect;
      if (regionCovered(grid, page, region, paintedAt)) {
        state.entries.delete(key);
        released = true;
      } else if (this.deps.debug) {
        const missing = tilesInRect(grid, page, region).filter((c) => !paintedAt(c));
        const detail = missing.slice(0, 3).map((c) => {
          const k = this.tileKey(pon, wantWidth, c, includeAnnotations, state.epoch);
          const e = state.entries.get(k);
          const st = !e ? 'NO-ENTRY' : !e.resolved ? 'PENDING' : 'RESOLVED-unpainted';
          return `${c.ix},${c.iy}=${st}`;
        });
        this.deps.debug(`retained ${key} blocked by: ${detail.join(' ')} (${missing.length} missing)`);
      }
    }
    return released;
  }

  /** Test/diagnostic introspection: bookkeeping size for one page. */
  stats(pon: number): { entries: number; inFlight: number } {
    return { entries: this.pages.get(pon)?.entries.size ?? 0, inFlight: this.inFlight };
  }

  /** Idempotent transit-slot release — the ONE place inFlight decrements. */
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
   *  carries everything that determines the fetched BITMAP for a coord
   *  (tile size, bleed, encode format): a raster's identity must include
   *  its geometry, or a cached handle from one configuration could be
   *  stretched into another's rect. Format genuinely varies at runtime —
   *  the cloud policy arrives async after open and can change the resolved
   *  format under a live store. */
  private tileKey(
    pon: number,
    levelWidth: number,
    c: TileCoord,
    includeAnnotations: boolean,
    epoch: number,
  ): string {
    const { tiles } = this.deps.options;
    const format = this.strategy().format;
    const geometry = `g${tiles.size}.${tiles.bleedPx}${format ? `.${format}` : ''}`;
    return `t:${pon}|w${levelWidth}|${c.ix},${c.iy}|a${includeAnnotations ? 1 : 0}|e${epoch}|${geometry}`;
  }
}

interface TileEntry {
  key: string;
  scale: number;
  coord: TileCoord;
  /** y-down page points. */
  rect: Rect;
  /** Fetch completed — the BYTES live in the RasterStore (peeked at paint
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
  /** Keys that FAILED (non-abort) at the current level — not retried until
   *  the level or epoch changes. */
  failedKeys: Set<string>;
  /** Bumped on ready/painted/drop — the plan memo key. */
  version: number;
  planCache: { demandKey: string; version: number; plan: TilePaintPlan } | null;
  settleTimer: ReturnType<typeof setTimeout> | null;
  /** Pending level identity (wantWidth) while the settle gate runs. */
  pendingLevel: number | null;
  /** Last visible rect from plan() — the release rule's "on screen". */
  lastVisible: Rect | null;
}

const coordKey = (c: TileCoord): string => `${c.ix},${c.iy}`;
const rectKey = (r: Rect): string =>
  `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;

const pagePonOf = (key: string): number => Number(key.slice(2, key.indexOf('|')));
const annotationsOf = (key: string): boolean => key.includes('|a1|');
