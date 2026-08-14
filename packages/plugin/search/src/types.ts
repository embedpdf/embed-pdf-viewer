import { createCapabilityToken, type PageObjectNumber } from '@embedpdf/core';
import type { Rect, TextQuad } from '@embedpdf/core-geometry';
import type { RevealAnchor, ScrollBehaviorKind } from '@embedpdf/plugin-stage';
import type { SearchMode, SearchQuery, SearchSnippet } from '@embedpdf/engine-core/runtime';

/**
 * One match, viewer-shaped: the engine's PDF-space line rects converted to
 * CONTENT space (y-down — the same space selection rects live in), plus the
 * page's display index so navigation can `reveal()` without a lookup.
 * `charStart`/`charCount` keep the engine's text-page offsets, so a hit can
 * later seed a selection or a highlight annotation without re-searching.
 */
/**
 * One merged visual line of a match, in content space — the structural twin
 * of selection's `SelectionSegment` and the engine's `PdfTextSegment`.
 * `quad` is the geometric authority (corner-named, frame-geometric); `rect`
 * its AABB; `advance` the reading direction along the baseline.
 */
export interface TextSegment {
  quad: TextQuad;
  rect: Rect;
  advance: 1 | -1;
}

export interface SearchHit {
  pon: PageObjectNumber;
  pageIndex: number;
  charStart: number;
  charCount: number;
  /** Canonical visual-line segments (content space) — the drawing input. */
  segments: TextSegment[];
  /** Union envelope of the segments — the scroll/reveal target. Absent when
   *  a match carries no drawable geometry (degenerate glyphs only). */
  bounds?: Rect;
  snippet?: SearchSnippet;
}

/**
 * `searching` means the slice loop is still walking pages — results are
 * usable the moment they appear (matches stream in viewport-first order).
 */
export type SearchStatus = 'idle' | 'searching' | 'complete' | 'error';

/**
 * Execution options for the session `search()` — HOW the scan runs, never
 * part of what the query MEANS (which is why they're not on `SearchQuery`
 * and are never stored or restored into a search box).
 */
export interface SearchExecOptions {
  /** Scan origin override. Defaults to the Stage's current page (viewport-first). */
  startPage?: PageObjectNumber;
}

/** Options for the session-free `findAll()` service. */
export interface SearchFindAllOptions {
  /** Abort the scan; the returned promise rejects with `signal.reason`. */
  signal?: AbortSignal;
  /**
   * Pin the slice mode. Default: `'full'` with automatic `'rects'`
   * fallback when snippets are denied — pass `'rects'` when you only need
   * geometry (e.g. redact-by-term) to skip snippet extraction entirely.
   */
  mode?: SearchMode;
}

export interface SearchState {
  /**
   * The query in flight/completed, null when idle/cleared — THE stored
   * form of the search intent, the same flat `SearchQuery` the engine
   * matches on, the wire caches by, and a search box renders. Survives
   * any search UI unmounting (results are document-scoped; so is this).
   */
  query: SearchQuery | null;
  status: SearchStatus;
  hits: SearchHit[];
  /** pon → indices into `hits` — the per-page layer's read model. */
  hitsByPage: Record<number, number[]>;
  /** Index into `hits`, -1 = none. */
  activeIndex: number;
  progress: { scanned: number; total: number };
  error: string | null;
}

export type SearchAction =
  | { type: 'START'; query: SearchQuery }
  | { type: 'APPEND'; hits: SearchHit[]; scanned: number; total: number }
  | { type: 'COMPLETE' }
  | { type: 'ERROR'; message: string }
  | { type: 'SET_ACTIVE'; index: number }
  | { type: 'CLEAR' };

/**
 * How hit navigation arrives (forwarded to the Stage's positioned reveal).
 * The default is the browser find-bar feel: the hit lands at the top-middle
 * of the viewport (`anchor: { y: 0.35 }`), horizontal only moves when the
 * hit is off-screen, zoom never changes, smooth tween.
 */
export interface SearchRevealOptions {
  anchor?: RevealAnchor;
  behavior?: ScrollBehaviorKind;
}

export interface SearchPluginConfig {
  /** Arrival defaults for `next()`/`prev()`/`goTo()`. */
  reveal?: SearchRevealOptions;
}

/**
 * The search plugin is a find SERVICE plus one user-visible search SESSION
 * per document. `findAll` is the service; `search` is the session; the
 * sidebar, the highlights layer, and next/prev render the session.
 */
export interface SearchCapability {
  // ── the session: THE user-visible find, one per document ────────────────
  /**
   * Start a new search (supersedes and aborts any running one). Results
   * stream into state slice by slice; the first hit becomes active but the
   * camera does NOT move until `next()`/`prev()`/`goTo()`. An empty
   * `query.text` is "stop searching" — identical to `clear()`.
   */
  search(query: SearchQuery, exec?: SearchExecOptions): void;
  /** Re-run the current query from scratch (used after document mutations). */
  rerun(): void;
  clear(): void;

  /** Advance to the next/previous hit (wraps) and reveal it (see {@link SearchRevealOptions}). */
  next(): SearchHit | null;
  prev(): SearchHit | null;
  /** Jump to a specific hit index and reveal it; `reveal` overrides the plugin defaults. */
  goTo(index: number, reveal?: SearchRevealOptions): SearchHit | null;

  /** The session's query — what a search box renders. Null when idle. */
  query(): SearchQuery | null;
  status(): SearchStatus;
  hits(): SearchHit[];
  hitCount(): number;
  activeIndex(): number;
  activeHit(): SearchHit | null;
  /** Hits on one page — the layer's input. Element identity is stable. */
  hitsForPage(pon: PageObjectNumber): SearchHit[];
  progress(): { scanned: number; total: number };
  errorMessage(): string | null;

  // ── the mechanism: session-free find service ─────────────────────────────
  /**
   * Run a query to completion and return every hit. Touches NO state — no
   * sidebar, no highlights, no camera, no activeIndex; the user's visible
   * search is never superseded. The primitive other features build on
   * (redact-by-term, link detection, occurrence badges). Scans in natural
   * page order; concurrent calls are independent.
   */
  findAll(query: SearchQuery, opts?: SearchFindAllOptions): Promise<SearchHit[]>;
}

export const SearchToken = createCapabilityToken<SearchCapability>('search');
