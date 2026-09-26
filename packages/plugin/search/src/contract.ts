import {
  type EventHook,
  type OperationOptions,
  type PageRef,
  type PluginErrorInfo,
} from '@embedpdf/core';
import type { Rect, TextQuad } from '@embedpdf/core-geometry';
import type { RevealAnchor, ScrollBehaviorKind } from '@embedpdf/plugin-stage/contract';
import type { SearchQuery, SearchSnippet } from '@embedpdf/engine-core/runtime';

export { validateSearchQuery, validateSearchRegex } from '@embedpdf/engine-core/runtime';
export type {
  SearchQuery,
  SearchQueryIssue,
  SearchQueryValidation,
  SearchRegexValidation,
  SearchSnippet,
} from '@embedpdf/engine-core/runtime';

/**
 * One merged visual line of a match in page space — the structural twin of
 * selection's `SelectionSegment`. `quad` is the geometric authority
 * (corner-named, frame-geometric); `rect` its bounds; `advance` the reading
 * direction along the baseline.
 */
export interface TextSegment {
  readonly quad: TextQuad;
  readonly rect: Rect;
  readonly advance: 1 | -1;
}

/**
 * One match. `page` is the durable page identity, `pageIndex` its display
 * index at the time of the match. `start`/`count` are a range of the page's
 * characters, so a hit goes straight to `selection.select(hit)` or a markup
 * annotation without re-searching.
 */
export interface SearchHit {
  readonly page: PageRef;
  readonly pageIndex: number;
  readonly start: number;
  readonly count: number;
  /** Visual-line segments in page space — the drawing input. */
  readonly segments: readonly TextSegment[];
  /** Union of the segments — the reveal target. Absent for matches with no drawable geometry. */
  readonly bounds?: Rect;
  readonly snippet?: SearchSnippet;
}

/**
 * `searching`: the scan is walking pages, hits are usable as they stream in.
 * `cancelled`: the scan was stopped by `cancel()`; the hits found so far stay.
 */
export type SearchStatus = 'idle' | 'searching' | 'complete' | 'cancelled' | 'error';

export interface SearchProgress {
  readonly pagesSearched: number;
  readonly pageCount: number;
}

/** How a navigated hit arrives: forwarded to the Stage's positioned reveal. */
export interface SearchRevealOptions {
  readonly anchor?: RevealAnchor;
  readonly behavior?: ScrollBehaviorKind;
}

export interface SearchOptions extends OperationOptions {
  /** Where to start. Defaults to the Stage's current page (viewport-first) when a Stage is installed. */
  readonly from?: PageRef;
}

export interface SearchFindAllOptions extends OperationOptions {
  /**
   * Pin whether hits carry snippets. By default they do, falling back to none
   * when snippets are denied; pass `false` when only geometry is needed.
   */
  readonly snippets?: boolean;
}

/** What a `search()` resolved to: it finished, a newer search replaced it, or it was cancelled. */
export interface SearchResult {
  readonly status: 'complete' | 'superseded' | 'cancelled';
  readonly hitCount: number;
}

export interface SearchHitFilter {
  readonly page?: PageRef;
}

export interface SearchConfig {
  /** Arrival defaults for `nextHit()` / `previousHit()` / `goToHit()`. */
  readonly reveal?: SearchRevealOptions;
}

// ── events ────────────────────────────────────────────────────────────────

export interface SearchStartedEvent {
  readonly query: SearchQuery;
  readonly operationId: string;
}
export interface SearchProgressEvent extends SearchProgress {
  readonly hitCount: number;
  readonly operationId: string;
}
export interface SearchCompletedEvent {
  readonly hitCount: number;
  readonly operationId: string;
}
export interface SearchCancelledEvent {
  readonly operationId: string;
  readonly reason: 'superseded' | 'cancelled' | 'cleared';
}
export interface SearchFailedEvent {
  readonly error: PluginErrorInfo;
  readonly operationId: string;
}
export interface SearchActiveHitChangedEvent {
  readonly index: number;
  readonly hit: SearchHit | null;
}
export type SearchClearedEvent = Record<string, never>;

/**
 * The search plugin is a find service (`findAll`) plus one user-visible
 * search session per document (`search` and everything below it). The
 * sidebar, the highlight layer and next/previous render the session.
 */
export interface SearchCapability {
  /**
   * Would a search be served now: `doc.text.search`. With `snippets: true`
   * it also needs `doc.text.copy`, because a snippet reproduces document text.
   */
  canSearch(options?: { readonly snippets?: boolean }): boolean;

  // ── the session ─────────────────────────────────────────────────────────
  /**
   * Start a new search. A newer search supersedes and aborts a running one.
   * Hits stream into the session as they are found; the first hit becomes
   * active but the camera does not move until you navigate. Resolves when
   * the scan completes, is superseded, or is cancelled; rejects only on a
   * real failure. An empty `query.text` is identical to `clear()`.
   */
  search(query: SearchQuery, options?: SearchOptions): Promise<SearchResult>;
  /** Re-run the current query from scratch (the plugin does this itself after document mutations). */
  refresh(options?: OperationOptions): Promise<SearchResult>;
  /** Stop the scan and keep the hits found so far. */
  cancel(): void;
  /** Stop the scan and drop the session. */
  clear(): void;

  /** Step to the next / previous hit, wrapping, and reveal it. */
  nextHit(options?: SearchRevealOptions): SearchHit | null;
  previousHit(options?: SearchRevealOptions): SearchHit | null;
  /** Jump to a hit by index (wraps) and reveal it. */
  goToHit(index: number, options?: SearchRevealOptions): SearchHit | null;
  /** Bring the active hit back into view without changing it. */
  revealActiveHit(options?: SearchRevealOptions): void;

  getQuery(): SearchQuery | null;
  getStatus(): SearchStatus;
  /** Hits found so far, or those on one page. Reference-stable per page until new hits land there. */
  listHits(filter?: SearchHitFilter): readonly SearchHit[];
  getHitCount(page?: PageRef): number;
  listPagesWithHits(): readonly PageRef[];
  /** `-1` when no hit is active. */
  getActiveHitIndex(): number;
  getActiveHit(): SearchHit | null;
  getProgress(): SearchProgress;
  getError(): PluginErrorInfo | null;

  // ── the service ─────────────────────────────────────────────────────────
  /**
   * Run a query to completion and return every hit, touching no session
   * state. Scans in natural page order; concurrent calls are independent.
   * Rejects `operation-cancelled` when `options.signal` aborts.
   */
  findAll(query: SearchQuery, options?: SearchFindAllOptions): Promise<readonly SearchHit[]>;

  readonly onStarted: EventHook<SearchStartedEvent>;
  readonly onProgress: EventHook<SearchProgressEvent>;
  readonly onCompleted: EventHook<SearchCompletedEvent>;
  readonly onCancelled: EventHook<SearchCancelledEvent>;
  readonly onFailed: EventHook<SearchFailedEvent>;
  readonly onActiveHitChanged: EventHook<SearchActiveHitChangedEvent>;
  readonly onCleared: EventHook<SearchClearedEvent>;
}

export { SearchToken } from './token';
