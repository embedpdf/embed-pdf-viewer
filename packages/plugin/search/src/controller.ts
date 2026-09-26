import {
  PluginError,
  isPluginError,
  toPluginError,
  toPluginErrorInfo,
  type ControllerContext,
  type LatestCancellation,
  type PageRef,
} from '@embedpdf/core';
import { boundsOfRects, textQuadBounds, type TextQuad } from '@embedpdf/core-geometry';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import type { PdfQuad, SearchMode, SearchQuery, SearchSlice } from '@embedpdf/engine-core/runtime';
import type {
  SearchActiveHitChangedEvent,
  SearchCancelledEvent,
  SearchCapability,
  SearchClearedEvent,
  SearchCompletedEvent,
  SearchConfig,
  SearchFailedEvent,
  SearchHit,
  SearchProgressEvent,
  SearchResult,
  SearchRevealOptions,
  SearchStartedEvent,
} from './contract';
import { pagesWithHits, type SearchAction, type SearchState } from './model';

const EMPTY: readonly SearchHit[] = Object.freeze([]);
const EMPTY_PAGES: readonly PageRef[] = Object.freeze([]);

/** The browser find-bar feel: hit at the top-middle, no zoom change. */
const DEFAULT_REVEAL: SearchRevealOptions = { anchor: { y: 0.35 }, behavior: 'smooth' };

/** Reruns after document mutations are coalesced: a burst of events triggers one rescan. */
const RERUN_DELAY_MS = 250;

interface AbortableSlice extends Promise<SearchSlice> {
  abort?(reason?: unknown): void;
}

/** How a `collect()` consumer observes the loop: the session dispatches, findAll accumulates. */
interface CollectSink {
  /** Before the first slice AND again on a stale-cursor restart: reset any accumulation. */
  onStart(): void;
  onSlice(hits: readonly SearchHit[], scanned: number, total: number): void;
}

/**
 * The search controller. `search` runs on a `latest` lane (a newer search
 * supersedes the older one, which can no longer publish); `findAll` runs on
 * its own signal and never touches the session. Both share `collect`, the
 * one cursor loop over the engine's budgeted slices.
 */
export function createSearchController(
  ctx: ControllerContext<SearchState, SearchAction>,
  config: SearchConfig = {},
) {
  const session = ctx.latest('session');
  const started = ctx.events.source<SearchStartedEvent>();
  const progress = ctx.events.source<SearchProgressEvent>();
  const completed = ctx.events.source<SearchCompletedEvent>();
  const cancelled = ctx.events.source<SearchCancelledEvent>();
  const failed = ctx.events.source<SearchFailedEvent>();
  const activeHitChanged = ctx.events.source<SearchActiveHitChangedEvent>();
  const cleared = ctx.events.source<SearchClearedEvent>();

  const state = () => ctx.getState();

  // ── projection: engine slice → page-space hits ───────────────────────────

  function hitsFromSlice(slice: SearchSlice): SearchHit[] {
    const hits: SearchHit[] = [];
    for (const match of slice.matches) {
      // A page that vanished mid-search (deleted) drops its hits.
      const page = ctx.getPage(match.page);
      if (!page) continue;
      const space = ctx.geometry.forPage(match.page);
      // Engine quads carry frame-geometric slot semantics (p1..p4 = upper-start,
      // upper-end, lower-start, lower-end): the y-flip maps corners onto their names.
      const toQuad = (q: PdfQuad): TextQuad => {
        const p = space.pdfQuadToPage(q);
        return { upperStart: p.p1, upperEnd: p.p2, lowerStart: p.p3, lowerEnd: p.p4 };
      };
      const segments = match.segments.map((segment) => {
        const quad = toQuad(segment.quad);
        return { quad, rect: textQuadBounds(quad), advance: segment.advance };
      });
      hits.push({
        page: match.page,
        pageIndex: page.index,
        charStart: match.charStart,
        charCount: match.charCount,
        segments,
        ...(segments.length
          ? { bounds: boundsOfRects(segments.map((s) => s.rect)) ?? undefined }
          : {}),
        ...(match.snippet ? { snippet: match.snippet } : {}),
      });
    }
    return hits;
  }

  // ── the mechanism ────────────────────────────────────────────────────────

  /**
   * One cursor loop over budgeted slices: permission fallback ('full' → 'rects'
   * when snippets are denied, unless pinned), restart-once on a stale cursor,
   * projection per slice. Returns true on exhaustion, false when the signal
   * aborted; throws on a real error (already a PluginError: ctx.doc is guarded).
   */
  async function collect(
    query: SearchQuery,
    options: { startPage?: PageRef; mode?: SearchMode; signal: AbortSignal },
    sink: CollectSink,
  ): Promise<boolean> {
    const { signal } = options;
    sink.onStart();

    let mode: SearchMode = options.mode ?? 'full';
    const modePinned = options.mode !== undefined;
    let cursor: string | undefined;
    let restarted = false;
    for (;;) {
      if (signal.aborted) return false;
      let slice: SearchSlice;
      const request = {
        query,
        mode,
        ...(cursor !== undefined
          ? { cursor }
          : options.startPage !== undefined
            ? { startPage: options.startPage }
            : {}),
      };
      const pending = ctx.doc.search.query(request) as AbortableSlice;
      const onAbort = () => pending.abort?.(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        slice = await pending;
      } catch (error) {
        if (signal.aborted) return false;
        // Snippets denied (no doc.text.copy)? Degrade to rect-only matches.
        if (
          !modePinned &&
          mode === 'full' &&
          cursor === undefined &&
          isPluginError(error, 'permission-denied')
        ) {
          mode = 'rects';
          continue;
        }
        // A stale cursor rejects with InvalidArg: the document changed under the
        // loop. Position is lost, the query is not: restart once from scratch.
        if (cursor !== undefined && !restarted && isPluginError(error, 'invalid-input')) {
          restarted = true;
          cursor = undefined;
          sink.onStart();
          continue;
        }
        throw error;
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
      if (signal.aborted) return false;
      sink.onSlice(hitsFromSlice(slice), slice.scannedPages, slice.totalPages);
      if (slice.nextCursor === null) return true;
      cursor = slice.nextCursor;
    }
  }

  // ── the session ──────────────────────────────────────────────────────────

  const viewportFirstPage = (): PageRef | undefined => {
    const stage = ctx.tryGet(StageToken);
    return stage ? (stage.getCurrentPage()?.ref ?? undefined) : undefined;
  };

  function search(
    query: SearchQuery,
    options: { startPage?: PageRef; signal?: AbortSignal } = {},
  ): Promise<SearchResult> {
    if (query.text.length === 0) {
      clear();
      return Promise.resolve({ status: 'complete', hitCount: 0 });
    }
    let operationId = '';
    return session
      .run(async (run) => {
        operationId = run.id;
        const startPage = options.startPage ?? viewportFirstPage();
        const complete = await collect(
          query,
          { startPage, signal: run.signal },
          {
            onStart: () =>
              run.commit(() => {
                ctx.dispatch({ type: 'START', query, operationId: run.id });
                started.emit({ query, operationId: run.id });
              }),
            onSlice: (hits, scanned, total) =>
              run.commit(() => {
                ctx.dispatch({ type: 'APPEND', hits, scanned, total });
                progress.emit({
                  scanned,
                  total,
                  hitCount: state().hits.length,
                  operationId: run.id,
                });
              }),
          },
        );
        if (!complete) throw new PluginError('operation-cancelled', 'search', 'search aborted');
        run.commit(() => {
          ctx.dispatch({ type: 'COMPLETE' });
          completed.emit({ hitCount: state().hits.length, operationId: run.id });
        });
        return { status: 'complete', hitCount: state().hits.length } as SearchResult;
      }, options)
      .catch((error: unknown): SearchResult => {
        if (isPluginError(error, 'instance-closed')) return { status: 'cancelled', hitCount: 0 };
        if (isPluginError(error, 'operation-cancelled')) {
          const why = (error.details as LatestCancellation | undefined)?.reason ?? 'cancelled';
          const reason: SearchCancelledEvent['reason'] =
            why === 'superseded' ? 'superseded' : why === 'cleared' ? 'cleared' : 'cancelled';
          // A superseded or cleared run has already lost the session; a cancelled one keeps its hits.
          if (reason === 'cancelled' && state().operationId === operationId)
            ctx.dispatch({ type: 'CANCELLED' });
          cancelled.emit({ operationId, reason });
          return {
            status: reason === 'superseded' ? 'superseded' : 'cancelled',
            hitCount: state().hits.length,
          };
        }
        const info = toPluginErrorInfo(toPluginError('search', error));
        if (state().operationId === operationId) ctx.dispatch({ type: 'ERROR', error: info });
        failed.emit({ error: info, operationId });
        throw error;
      });
  }

  function clear(): void {
    session.cancel('cleared');
    if (state().status === 'idle') return;
    ctx.dispatch({ type: 'CLEAR' });
    cleared.emit({});
  }

  function goToHit(index: number, options?: SearchRevealOptions): SearchHit | null {
    const { hits } = state();
    if (hits.length === 0) return null;
    const wrapped = ((index % hits.length) + hits.length) % hits.length;
    if (state().activeIndex !== wrapped) {
      ctx.dispatch({ type: 'SET_ACTIVE', index: wrapped });
      activeHitChanged.emit({ index: wrapped, hit: hits[wrapped] });
    }
    reveal(hits[wrapped], options);
    return hits[wrapped];
  }

  function reveal(hit: SearchHit, options?: SearchRevealOptions): void {
    // Positioned reveal: the HIT (not just its page) arrives at the anchor —
    // per-call override > plugin config > find-bar default. Zoom never changes.
    const arrival = { ...DEFAULT_REVEAL, ...config.reveal, ...options };
    ctx.tryGet(StageToken)?.reveal(hit.page, {
      rect: hit.bounds,
      anchor: arrival.anchor,
      behavior: arrival.behavior,
    });
  }

  const api: SearchCapability = {
    // The twin. Search is a pure request: the verbs carry no client gate (the
    // engine enforces; the error state reports); the twin hides affordances.
    canSearch: (mode) => {
      const security = ctx.doc.security;
      return (
        security.allows('doc.text.search') && (mode !== 'full' || security.allows('doc.text.copy'))
      );
    },

    search,
    refresh: (options) => {
      const { query, status } = state();
      if (!query || status === 'idle') return Promise.resolve({ status: 'complete', hitCount: 0 });
      return search(query, options);
    },
    cancel: () => session.cancel('cancelled'),
    clear,

    nextHit: (options) => goToHit(state().activeIndex + 1, options),
    previousHit: (options) => goToHit(state().activeIndex - 1, options),
    goToHit,
    revealActiveHit: (options) => {
      const hit = api.getActiveHit();
      if (hit) reveal(hit, options);
    },

    getQuery: () => state().query,
    getStatus: () => state().status,
    listHits: (filter) =>
      filter?.page ? (state().hitsByPage[filter.page.pageObjectNumber] ?? EMPTY) : state().hits,
    getHitCount: (page) =>
      page ? (state().hitsByPage[page.pageObjectNumber]?.length ?? 0) : state().hits.length,
    listPagesWithHits: () => (state().hits.length ? pagesWithHits(state()) : EMPTY_PAGES),
    getActiveHitIndex: () => state().activeIndex,
    getActiveHit: () => {
      const { hits, activeIndex } = state();
      return activeIndex >= 0 && activeIndex < hits.length ? hits[activeIndex] : null;
    },
    getProgress: () => state().progress,
    getError: () => state().error,

    // ── the service ──────────────────────────────────────────────────────
    findAll: async (query, options = {}) => {
      const controller = new AbortController();
      const onCaller = () => controller.abort(options.signal?.reason);
      if (options.signal?.aborted) onCaller();
      options.signal?.addEventListener('abort', onCaller, { once: true });
      const all: SearchHit[] = [];
      try {
        const complete = await collect(
          query,
          { mode: options.mode, signal: controller.signal },
          {
            onStart: () => {
              all.length = 0;
            },
            onSlice: (hits) => all.push(...hits),
          },
        );
        if (!complete) throw new PluginError('operation-cancelled', 'search', 'findAll aborted');
        return all;
      } finally {
        options.signal?.removeEventListener('abort', onCaller);
      }
    },

    onStarted: started.on,
    onProgress: progress.on,
    onCompleted: completed.on,
    onCancelled: cancelled.on,
    onFailed: failed.on,
    onActiveHitChanged: activeHitChanged.on,
    onCleared: cleared.on,
  };

  return {
    api,
    connect() {
      // Every confirmed mutation (own or remote) invalidates cursors and can change
      // what is findable, so the running or finished session re-runs its query.
      let timer: ReturnType<typeof setTimeout> | null = null;
      ctx.listen(ctx.doc.events, () => {
        if (state().status === 'idle') return;
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          void api.refresh().catch(() => {
            /* surfaced through getStatus() and onFailed */
          });
        }, RERUN_DELAY_MS);
      });
      ctx.cleanup(() => {
        if (timer !== null) clearTimeout(timer);
      });
    },
  };
}
