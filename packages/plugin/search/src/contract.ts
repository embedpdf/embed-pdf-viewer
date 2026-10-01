import {
  type DeepPartial,
  type EventHook,
  type OperationOptions,
  type PageRef,
  type PluginErrorInfo,
  type SettingsApi,
} from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';
import type { RevealAnchor, ScrollBehaviorKind } from '@embedpdf/plugin-stage/contract';
import type { PdfTextSegment, SearchQuery, SearchSnippet } from '@embedpdf/engine-core/runtime';

export { validateSearchQuery, validateSearchRegex } from '@embedpdf/engine-core/runtime';
export type {
  SearchQuery,
  SearchQueryIssue,
  SearchQueryValidation,
  SearchRegexValidation,
  SearchSnippet,
} from '@embedpdf/engine-core/runtime';

/**
 * One merged visual line of a match in page space, as the engine's layout
 * gives it (selection's `SelectionSegment` is the same line). `quad` is the
 * geometric authority, its corners named in the line's own frame; `rect` its
 * bounds; `advance` the reading direction along the baseline.
 */
export type TextSegment = PdfTextSegment;

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

// ── settings ──────────────────────────────────────────────────────────────

/** How a match arrives in view when you move to it: forwarded to the Stage's positioned reveal. */
export interface SearchReveal {
  /** Where the match lands in the view: `{ y: 0.35 }` puts it 35% of the way down, like a browser's find bar. */
  readonly anchor: RevealAnchor;
  /** Glide there (`'smooth'`) or jump (`'instant'`). */
  readonly behavior: ScrollBehaviorKind;
}

/** The `reveal` setting for one call: what the call leaves out comes from the setting. */
export type SearchRevealOptions = Partial<SearchReveal>;

/** How the highlights mix with the page: a CSS `mix-blend-mode` keyword. */
export type SearchBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/**
 * The search plugin's settings. `searchPlugin(config)` registers them over
 * {@link SEARCH_DEFAULTS}, and `updateSettings()` changes them for every
 * document while the app runs. The highlight's three can also come from CSS
 * (`--epdf-search-highlight`, `--epdf-search-highlight-active`,
 * `--epdf-search-blend-mode`), which wins over the setting.
 */
export interface SearchSettings {
  /** Where a match lands when `nextHit()`, `previousHit()` or `goToHit()` moves to it. */
  readonly reveal: SearchReveal;
  readonly highlight: {
    /** The highlight of every match. */
    readonly color: string;
    /** The highlight of the active match. */
    readonly activeColor: string;
    /**
     * `'multiply'` is a real highlighter: the text stays crisp through the
     * color and only the paper tints. On dark or scanned pages, where a
     * multiplied highlight disappears, use `'normal'` with translucent colors.
     */
    readonly blendMode: SearchBlendMode;
  };
}

/** What the search settings are when the app registers none. */
export const SEARCH_DEFAULTS: SearchSettings = {
  reveal: { anchor: { y: 0.35 }, behavior: 'smooth' },
  highlight: { color: '#ffd500', activeColor: '#ff9632', blendMode: 'multiply' },
};

/** What `searchPlugin(config)` takes: any of the settings, merged over the defaults. */
export type SearchConfig = DeepPartial<SearchSettings>;

// ── verbs ─────────────────────────────────────────────────────────────────

export interface SearchOptions extends OperationOptions {
  /**
   * Where to start: a page's ref or its index. Defaults to the Stage's
   * current page (viewport-first) when a Stage is installed.
   */
  readonly from?: PageRef | number;
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
  /** One page's hits: its ref or its index. */
  readonly page?: PageRef | number;
}

// ── events ────────────────────────────────────────────────────────────────

export interface SearchStartedEvent {
  readonly query: SearchQuery;
}
/**
 * The search's progress changed: how many pages were searched, of how many,
 * and the matches found so far. The same values `getProgress()` and
 * `getHitCount()` return from then on.
 */
export interface SearchProgressChangedEvent extends SearchProgress {
  readonly hitCount: number;
}
export interface SearchCompletedEvent {
  readonly hitCount: number;
}
export interface SearchCancelledEvent {
  readonly reason: 'superseded' | 'cancelled' | 'cleared';
}
export interface SearchFailedEvent {
  readonly error: PluginErrorInfo;
}
export interface SearchActiveHitChangedEvent {
  readonly index: number;
  readonly hit: SearchHit | null;
}
export type SearchClearedEvent = Record<string, never>;

/**
 * The search plugin is a find service (`findAll`) plus one user-visible
 * search session per document (`search` and everything below it). The
 * sidebar, the highlight layer and next/previous render the session. Its
 * settings (`getSettings`, `updateSettings`, `resetSettings`,
 * `onSettingsChanged`) belong to the plugin, not to a document: a change
 * reaches every open document.
 */
export interface SearchCapability extends SettingsApi<SearchSettings> {
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
   * the scan completes, is superseded, or is cancelled (also through
   * `options.signal`); rejects only on a real failure, `permission-denied`
   * without `doc.text.search`, or `not-found` for a `from` page that isn't in
   * the document. A refusal only rejects: the session stays as it was and no
   * event fires. An empty `query.text` is identical to `clear()`. Fires
   * `onStarted`, `onProgressChanged` as each slice of pages is searched, then
   * `onCompleted`, `onCancelled` or `onFailed`.
   */
  search(query: SearchQuery, options?: SearchOptions): Promise<SearchResult>;
  /**
   * Re-run the current query from scratch (the plugin does this itself after
   * document mutations). Resolves and rejects as `search()` does.
   */
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
  /**
   * Hits found so far, or those on one page. Reference-stable (per page too)
   * until new hits land there. Empty for a page that isn't in the document,
   * so a layer that reads while its page is deleted still renders.
   */
  listHits(filter?: SearchHitFilter): readonly SearchHit[];
  /** How many hits were found so far, or on one page; 0 for a page that isn't in the document. */
  getHitCount(page?: PageRef | number): number;
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
   * Rejects `operation-cancelled` when `options.signal` aborts, and
   * `permission-denied` without `doc.text.search`.
   */
  findAll(query: SearchQuery, options?: SearchFindAllOptions): Promise<readonly SearchHit[]>;

  readonly onStarted: EventHook<SearchStartedEvent>;
  /**
   * `getProgress()` changed: once per slice of pages a search gets through,
   * and back to none when a new search starts or the session is cleared.
   */
  readonly onProgressChanged: EventHook<SearchProgressChangedEvent>;
  readonly onCompleted: EventHook<SearchCompletedEvent>;
  readonly onCancelled: EventHook<SearchCancelledEvent>;
  readonly onFailed: EventHook<SearchFailedEvent>;
  readonly onActiveHitChanged: EventHook<SearchActiveHitChangedEvent>;
  readonly onCleared: EventHook<SearchClearedEvent>;
}

export { SearchToken } from './token';
