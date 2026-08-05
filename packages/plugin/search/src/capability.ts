import type { PageObjectNumber, PluginContext } from '@embedpdf/core';
import {
  applyRect,
  boundsOfRects,
  pageGeometry,
  type Rect,
  type RectIn,
} from '@embedpdf/core-geometry';
import { StageToken } from '@embedpdf/plugin-stage';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type {
  PdfRect,
  SearchMatch,
  SearchMode,
  SearchQuery,
  SearchSlice,
} from '@embedpdf/engine-core/runtime';

import type {
  SearchAction,
  SearchCapability,
  SearchHit,
  SearchPluginConfig,
  SearchRevealOptions,
  SearchState,
} from './types';

const EMPTY: SearchHit[] = [];

/** The browser find-bar feel: hit at the top-middle, no zoom change. */
const DEFAULT_REVEAL: SearchRevealOptions = { anchor: { y: 0.35 }, behavior: 'smooth' };

/** Local engines reject a denied scope before the worker; cloud maps 403. */
const isPermissionDenied = (err: unknown): boolean =>
  (err instanceof Error && err.name === 'PermissionDenied') ||
  EngineError.is(err, EngineErrorCode.Forbidden);

/**
 * The search capability: a client-driven cursor loop over the engine's
 * budgeted slices. One generation counter arbitrates: a new `search()` (or
 * `clear()`, or a document mutation via `rerun()`) supersedes the running
 * loop, which aborts its in-flight slice and stops dispatching.
 *
 * Rect conversion happens HERE, once per slice: the engine's PDF-space
 * line rects → content space through the same page geometry the selection
 * plugin uses, so search highlights and selection highlights are pixel-twins.
 *
 * Stage integration is optional and additive: with a Stage present the scan
 * starts at the current page (viewport-first — the hits the user is looking
 * at arrive in the first slice) and `next()`/`prev()`/`goTo()` reveal the
 * hit's page. Without one, navigation still works; the host scrolls.
 */
export function createSearchCapability(
  ctx: PluginContext<SearchState, SearchAction>,
  config: SearchPluginConfig = {},
): SearchCapability {
  let generation = 0;
  let inflight: { abort(reason?: unknown): void } | null = null;

  const toContent = (m: ReturnType<typeof pageGeometry>['pdfToContent'], b: PdfRect): Rect =>
    applyRect(
      m as never,
      {
        x: b.left,
        y: b.bottom,
        width: b.right - b.left,
        height: b.top - b.bottom,
      } as RectIn<'pdf'>,
    ) as Rect;

  interface PageConverter {
    pageIndex: number;
    toRect: (b: PdfRect) => Rect;
  }

  function hitsFromSlice(slice: SearchSlice): SearchHit[] {
    // zoom = 1: content space is scale-free; the layer applies the page
    // transform at render time (the selection idiom).
    const converters = new Map<PageObjectNumber, PageConverter | null>();
    const converterFor = (pon: PageObjectNumber): PageConverter | null => {
      let conv = converters.get(pon);
      if (conv !== undefined) return conv;
      const layout = ctx.document()?.pages.find((p) => p.pageObjectNumber === pon);
      if (!layout) {
        conv = null; // page vanished mid-search (delete); drop its hits
      } else {
        const { pdfToContent } = pageGeometry(
          { crop: layout.boxes.crop, rotation: layout.rotation, userUnit: layout.userUnit },
          1,
        );
        conv = { pageIndex: layout.index, toRect: (b) => toContent(pdfToContent, b) };
      }
      converters.set(pon, conv);
      return conv;
    };

    const hits: SearchHit[] = [];
    for (const match of slice.matches) {
      const conv = converterFor(match.pageObjectNumber);
      if (!conv) continue;
      hits.push({
        pon: match.pageObjectNumber,
        pageIndex: conv.pageIndex,
        charStart: match.charStart,
        charCount: match.charCount,
        rects: match.rects.map(conv.toRect),
        ...(match.snippet ? { snippet: match.snippet } : {}),
      });
    }
    return hits;
  }

  /** How a collect() consumer observes the loop — the session dispatches
   *  into state, findAll accumulates locally. */
  interface CollectSink {
    /** Called before the first slice AND again on a stale-cursor restart —
     *  reset any accumulation. */
    onStart: () => void;
    onSlice: (hits: SearchHit[], scanned: number, total: number) => void;
    /** Superseded / aborted — the loop stops without completing. */
    isCancelled: () => boolean;
    setInflight: (pending: { abort(reason?: unknown): void } | null) => void;
  }

  /**
   * THE MECHANISM — one cursor loop over the engine's budgeted slices,
   * shared by the session (`search`) and the session-free service
   * (`findAll`): permission fallback ('full' → 'rects' when snippets are
   * denied, unless the caller pinned a mode), restart-once on a stale
   * cursor, rect conversion per slice. Resolves true on exhaustion, false
   * when cancelled; throws on error.
   */
  async function collect(
    query: SearchQuery,
    opts: { startPage?: PageObjectNumber; mode?: SearchMode },
    sink: CollectSink,
  ): Promise<boolean> {
    const doc = ctx.doc;
    if (!doc) return false;

    sink.onStart();

    let mode: SearchMode = opts.mode ?? 'full';
    const modePinned = opts.mode !== undefined;
    let cursor: string | undefined;
    let restarted = false;
    for (;;) {
      let slice: SearchSlice;
      try {
        const request = {
          query,
          mode,
          ...(cursor !== undefined
            ? { cursor }
            : opts.startPage !== undefined
              ? { startPage: opts.startPage }
              : {}),
        };
        const pending = doc.search.query(request);
        sink.setInflight(pending);
        slice = await pending;
      } catch (err) {
        if (sink.isCancelled()) return false; // superseded — the abort was ours
        // Snippets denied (no doc.text.copy)? Degrade to rect-only matches
        // instead of failing the whole search — find still works.
        if (!modePinned && mode === 'full' && cursor === undefined && isPermissionDenied(err)) {
          mode = 'rects';
          continue;
        }
        // A stale cursor rejects with InvalidArg — the document changed
        // under the loop, or the engine's session was recycled. Position
        // is lost, the query isn't: restart once from scratch.
        if (cursor !== undefined && !restarted && EngineError.is(err, EngineErrorCode.InvalidArg)) {
          restarted = true;
          cursor = undefined;
          sink.onStart();
          continue;
        }
        throw err;
      }
      if (sink.isCancelled()) return false;
      sink.onSlice(hitsFromSlice(slice), slice.scannedPages, slice.totalPages);
      if (slice.nextCursor === null) {
        sink.setInflight(null);
        return true;
      }
      cursor = slice.nextCursor;
    }
  }

  /** THE SESSION — collect() with state as the sink, generation-guarded. */
  async function runSession(query: SearchQuery, startPage?: PageObjectNumber): Promise<void> {
    const gen = ++generation;
    inflight?.abort('superseded');
    inflight = null;

    if (!ctx.doc) {
      ctx.dispatch({ type: 'CLEAR' });
      return;
    }

    // Viewport-first: begin scanning where the user is looking.
    if (startPage === undefined) {
      const stage = ctx.tryGet(StageToken);
      if (stage) startPage = ctx.document()?.pages[stage.currentPage()]?.pageObjectNumber;
    }

    try {
      const complete = await collect(
        query,
        { startPage },
        {
          onStart: () => ctx.dispatch({ type: 'START', query }),
          onSlice: (hits, scanned, total) => ctx.dispatch({ type: 'APPEND', hits, scanned, total }),
          isCancelled: () => gen !== generation,
          setInflight: (pending) => {
            if (gen === generation) inflight = pending;
          },
        },
      );
      if (complete && gen === generation) ctx.dispatch({ type: 'COMPLETE' });
    } catch (err) {
      if (gen !== generation) return;
      ctx.dispatch({ type: 'ERROR', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function goTo(index: number, reveal?: SearchRevealOptions): SearchHit | null {
    const { hits } = ctx.getState();
    if (hits.length === 0) return null;
    const wrapped = ((index % hits.length) + hits.length) % hits.length;
    ctx.dispatch({ type: 'SET_ACTIVE', index: wrapped });
    const hit = hits[wrapped];
    // Positioned reveal: the HIT (not just its page) arrives at the anchor —
    // per-call override > plugin config > find-bar default. Zoom never changes.
    const arrival = { ...DEFAULT_REVEAL, ...config.reveal, ...reveal };
    ctx.tryGet(StageToken)?.reveal(hit.pageIndex, {
      rect: boundsOfRects(hit.rects) ?? undefined,
      anchor: arrival.anchor,
      behavior: arrival.behavior,
    });
    return hit;
  }

  const clear = () => {
    generation++;
    inflight?.abort('cleared');
    inflight = null;
    ctx.dispatch({ type: 'CLEAR' });
  };

  return {
    // An empty text is "stop searching", not a query — identical to clear().
    search: (query, exec) =>
      query.text.length === 0 ? clear() : void runSession(query, exec?.startPage),

    // Replay the stored query verbatim; the rescan starts viewport-first.
    rerun: () => {
      const { query, status } = ctx.getState();
      if (query && status !== 'idle') void runSession(query);
    },

    clear,

    next: () => goTo(ctx.getState().activeIndex + 1),
    prev: () => goTo(ctx.getState().activeIndex - 1),
    goTo,

    query: () => ctx.getState().query,

    findAll: async (query, opts = {}) => {
      if (!ctx.doc) return [];
      const all: SearchHit[] = [];
      const signal = opts.signal;
      // Independent lifecycle: its own abort handle, never the session's
      // generation counter — a findAll can neither supersede the user's
      // visible search nor be superseded by it.
      let pending: { abort(reason?: unknown): void } | null = null;
      const onAbort = () => pending?.abort(signal?.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        await collect(
          query,
          { mode: opts.mode },
          {
            onStart: () => {
              all.length = 0;
            },
            onSlice: (hits) => all.push(...hits),
            isCancelled: () => signal?.aborted ?? false,
            setInflight: (p) => {
              pending = p;
            },
          },
        );
        if (signal?.aborted) throw signal.reason ?? new Error('findAll aborted');
        return all;
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },

    status: () => ctx.getState().status,
    hits: () => ctx.getState().hits,
    hitCount: () => ctx.getState().hits.length,
    activeIndex: () => ctx.getState().activeIndex,
    activeHit: () => {
      const { hits, activeIndex } = ctx.getState();
      return activeIndex >= 0 && activeIndex < hits.length ? hits[activeIndex] : null;
    },
    hitsForPage: (pon) => {
      const { hits, hitsByPage } = ctx.getState();
      const indices = hitsByPage[pon];
      return indices?.length ? indices.map((i) => hits[i]) : EMPTY;
    },
    progress: () => ctx.getState().progress,
    errorMessage: () => ctx.getState().error,
  };
}
