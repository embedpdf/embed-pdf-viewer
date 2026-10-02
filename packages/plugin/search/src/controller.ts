import {
  PluginError,
  isPluginError,
  toPluginError,
  toPluginErrorInfo,
  type PluginContext,
  type LatestCancellation,
  type PageRef,
} from '@embedpdf/core';
import { boundsOfRects } from '@embedpdf/core-geometry';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import type { SearchQuery, SearchSlice } from '@embedpdf/engine-core/runtime';
import type {
  SearchActiveHitChangedEvent,
  SearchCancelledEvent,
  SearchCapability,
  SearchClearedEvent,
  SearchCompletedEvent,
  SearchFailedEvent,
  SearchHit,
  SearchOptions,
  SearchProgressChangedEvent,
  SearchResult,
  SearchRevealOptions,
  SearchSettings,
  SearchStartedEvent,
} from './contract';
import {
  appendHits,
  cancelSession,
  clearSession,
  completeSession,
  failSession,
  indexOfHit,
  pagesWithHits,
  setActiveHit,
  startSession,
  type SearchState,
} from './model';

const EMPTY: readonly SearchHit[] = Object.freeze([]);
const EMPTY_PAGES: readonly PageRef[] = Object.freeze([]);

/** Reruns after document mutations are coalesced: a burst of events triggers one rescan. */
const RERUN_DELAY_MS = 250;

/** How a `collect()` consumer observes the loop: the session updates state, findAll accumulates. */
interface CollectSink {
  /** Before the first slice, and again on a stale-cursor restart: reset any accumulation. */
  onStart(): void;
  onSlice(hits: readonly SearchHit[], pagesSearched: number, pageCount: number): void;
}

/**
 * The search controller. `search` runs on a `latest` lane (a newer search
 * supersedes the older one, which can no longer publish); `findAll` runs on
 * its own signal and never touches the session. Both share `collect`, the
 * one cursor loop over the engine's budgeted slices.
 *
 * The scan's own events (started, completed, cancelled, failed) fire where
 * the scan reaches those points. The progress, active-hit and cleared events
 * are derived from state changes, so they always agree with the getters.
 *
 * The settings are read where they're used, never copied, so
 * `updateSettings({ reveal })` applies to the next move at once.
 */
export function createSearchController(ctx: PluginContext<SearchState, SearchSettings>) {
  const settings = ctx.settings();
  const session = ctx.latest('session');
  const started = ctx.events.source<SearchStartedEvent>();
  const progressChanged = ctx.events.source<SearchProgressChangedEvent>();
  const completed = ctx.events.source<SearchCompletedEvent>();
  const cancelled = ctx.events.source<SearchCancelledEvent>();
  const failed = ctx.events.source<SearchFailedEvent>();
  const activeHitChanged = ctx.events.source<SearchActiveHitChangedEvent>();
  const cleared = ctx.events.source<SearchClearedEvent>();

  const state = () => ctx.state.get();

  ctx.state.onChange(({ previous, next }) => {
    // A slice moves it forward; a new search or clear() puts it back to none.
    if (previous.progress !== next.progress) {
      progressChanged.emit({ ...next.progress, hitCount: next.hits.length });
    }
    if (previous.activeHitIndex !== next.activeHitIndex) {
      activeHitChanged.emit({
        index: next.activeHitIndex,
        hit: next.hits[next.activeHitIndex] ?? null,
      });
    }
    if (previous.status !== 'idle' && next.status === 'idle') cleared.emit({});
  });

  // ── projection: engine slice → page-space hits ───────────────────────────

  function hitsFromSlice(slice: SearchSlice): SearchHit[] {
    const hits: SearchHit[] = [];
    for (const match of slice.matches) {
      // A page that vanished mid-search (deleted) drops its hits.
      const page = ctx.getPage(match.page);
      if (!page) continue;
      // Segments arrive in page space, ready to draw.
      const segments = match.segments;
      hits.push({
        page: match.page,
        pageIndex: page.index,
        start: match.start,
        count: match.count,
        segments,
        ...(segments.length
          ? { bounds: boundsOfRects(segments.map((segment) => segment.rect)) ?? undefined }
          : {}),
        ...(match.snippet ? { snippet: match.snippet } : {}),
      });
    }
    return hits;
  }

  // ── the mechanism ────────────────────────────────────────────────────────

  /**
   * One cursor loop over budgeted slices: permission fallback (snippets → none
   * when they are denied, unless pinned), restart-once on a stale cursor,
   * projection per slice. Returns true on exhaustion, false when the signal
   * aborted; throws on a real error (already a PluginError: ctx.doc is guarded).
   */
  async function collect(
    query: SearchQuery,
    options: { from?: PageRef; snippets?: boolean; signal?: AbortSignal },
    sink: CollectSink,
  ): Promise<boolean> {
    const { signal } = options;
    sink.onStart();

    let snippets = options.snippets ?? true;
    const snippetsPinned = options.snippets !== undefined;
    let cursor: string | undefined;
    let restarted = false;
    for (;;) {
      if (signal?.aborted) return false;
      let slice: SearchSlice;
      const request = {
        ...query,
        snippets,
        ...(cursor !== undefined
          ? { cursor }
          : options.from !== undefined
            ? { from: options.from }
            : {}),
      };
      try {
        // Cancelling stops the engine working on the slice, not only the wait for it.
        slice = await ctx.cancellable(signal, ctx.doc.search.query(request));
      } catch (error) {
        if (signal?.aborted) return false;
        // Snippets denied (no doc.text.copy)? Degrade to matches without them.
        if (
          !snippetsPinned &&
          snippets &&
          cursor === undefined &&
          isPluginError(error, 'permission-denied')
        ) {
          snippets = false;
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
      }
      if (signal?.aborted) return false;
      sink.onSlice(hitsFromSlice(slice), slice.pagesSearched, slice.pageCount);
      if (slice.nextCursor === null) return true;
      cursor = slice.nextCursor;
    }
  }

  // ── the session ──────────────────────────────────────────────────────────

  const viewportFirstPage = (): PageRef | undefined => {
    const stage = ctx.tryGet(StageToken);
    return stage?.getCurrentPage() ?? undefined;
  };

  // Async so a refusal or a page that isn't in the document rejects, like any other failure,
  // before the session is touched. The run still starts synchronously, so a newer search
  // supersedes an older one in the order they were called.
  async function search(query: SearchQuery, options: SearchOptions = {}): Promise<SearchResult> {
    if (query.text.length === 0) {
      clear();
      return { status: 'complete', hitCount: 0 };
    }
    ctx.assertAllowed('doc.text.search', 'search');
    const from = options.from === undefined ? viewportFirstPage() : ctx.pageOf(options.from).ref;
    let operationId = '';
    return session
      .run(async (run) => {
        operationId = run.id;
        const complete = await collect(
          query,
          { from, signal: run.signal },
          {
            onStart: () =>
              run.commit(() => {
                ctx.state.update(startSession, query, run.id);
                started.emit({ query });
              }),
            onSlice: (hits, pagesSearched, pageCount) =>
              run.commit(() => ctx.state.update(appendHits, hits, { pagesSearched, pageCount })),
          },
        );
        if (!complete) throw new PluginError('operation-cancelled', 'search', 'search aborted');
        run.commit(() => {
          ctx.state.update(completeSession);
          completed.emit({ hitCount: state().hits.length });
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
          if (reason === 'cancelled' && state().operationId === operationId) {
            ctx.state.update(cancelSession);
          }
          cancelled.emit({ reason });
          return {
            status: reason === 'superseded' ? 'superseded' : 'cancelled',
            hitCount: state().hits.length,
          };
        }
        const info = toPluginErrorInfo(toPluginError('search', error));
        if (state().operationId === operationId) ctx.state.update(failSession, info);
        failed.emit({ error: info });
        throw error;
      });
  }

  function clear(): void {
    session.cancel('cleared');
    ctx.state.update(clearSession);
  }

  function goToHit(target: SearchHit | number, options?: SearchRevealOptions): SearchHit | null {
    const { hits } = state();
    if (hits.length === 0) return null;
    const index =
      typeof target === 'number'
        ? ((target % hits.length) + hits.length) % hits.length
        : indexOfHit(hits, target);
    if (index < 0) return null;
    ctx.state.update(setActiveHit, index);
    reveal(hits[index], options);
    return hits[index];
  }

  function reveal(hit: SearchHit, options?: SearchRevealOptions): void {
    // Positioned reveal: the hit (not just its page) arrives at the anchor —
    // the call's options over the `reveal` setting. Zoom never changes.
    const arrival = { ...settings.get().reveal, ...options };
    ctx.tryGet(StageToken)?.reveal(hit.page, {
      rect: hit.bounds,
      anchor: arrival.anchor,
      behavior: arrival.behavior,
    });
  }

  /**
   * One page's hits, by the page's ref or index. A page that isn't in the
   * document has none: a layer may read while its page is being deleted.
   */
  const hitsOn = (page: PageRef | number): readonly SearchHit[] => {
    const found = ctx.getPage(page);
    return found ? (state().hitsByPage[found.ref.objectNumber] ?? EMPTY) : EMPTY;
  };

  const api: SearchCapability = {
    ...settings.api,

    // The twin of search() and findAll(), which refuse without doc.text.search.
    // Snippets need doc.text.copy too, but a search without it still runs: its
    // matches come without snippets (see collect).
    canSearch: (options) =>
      ctx.allows('doc.text.search') && (!options?.snippets || ctx.allows('doc.text.copy')),

    search,
    refresh: (options) => {
      const { query, status } = state();
      if (!query || status === 'idle') return Promise.resolve({ status: 'complete', hitCount: 0 });
      return search(query, options);
    },
    cancel: () => session.cancel('cancelled'),
    clear,

    nextHit: (options) => goToHit(state().activeHitIndex + 1, options),
    previousHit: (options) => goToHit(state().activeHitIndex - 1, options),
    goToHit,
    revealActiveHit: (options) => {
      const hit = api.getActiveHit();
      if (hit) reveal(hit, options);
    },

    getQuery: () => state().query,
    getStatus: () => state().status,
    listHits: (filter) => (filter?.page === undefined ? state().hits : hitsOn(filter.page)),
    getHitCount: (page) => (page === undefined ? state().hits : hitsOn(page)).length,
    listPagesWithHits: () =>
      state().hits.length ? pagesWithHits(state(), ctx.document()?.pages ?? []) : EMPTY_PAGES,
    getActiveHitIndex: () => state().activeHitIndex,
    getActiveHit: () => state().hits[state().activeHitIndex] ?? null,
    getProgress: () => state().progress,
    getError: () => state().error,

    // ── the service ──────────────────────────────────────────────────────
    findAll: async (query, options = {}) => {
      ctx.assertAllowed('doc.text.search', 'findAll');
      const all: SearchHit[] = [];
      const complete = await collect(
        query,
        {
          ...(options.snippets !== undefined ? { snippets: options.snippets } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        },
        {
          onStart: () => {
            all.length = 0;
          },
          onSlice: (hits) => all.push(...hits),
        },
      );
      if (!complete) throw new PluginError('operation-cancelled', 'search', 'findAll aborted');
      return all;
    },

    onStarted: started.on,
    onProgressChanged: progressChanged.on,
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
