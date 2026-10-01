/**
 * The search session: the query, the hits found so far (also grouped by
 * page), the active hit, and progress. Every function below is a pure
 * transition; the controller applies them with `ctx.state.update`.
 */
import { pageRefsEqual, type PageRef, type PluginErrorInfo } from '@embedpdf/core';
import type { SearchQuery } from '@embedpdf/engine-core/runtime';

import type { SearchHit, SearchProgress, SearchStatus } from './contract';

export interface SearchState {
  /** The query being searched, as the engine matches it. Null when idle. */
  readonly query: SearchQuery | null;
  readonly status: SearchStatus;
  /** The run that owns the session, so a run that lost it (superseded, cleared) leaves it alone. */
  readonly operationId: string | null;
  readonly hits: readonly SearchHit[];
  /** Page object number → the hits on that page; a page's array is replaced only when it gains hits. */
  readonly hitsByPage: Readonly<Record<number, readonly SearchHit[]>>;
  /** Index into `hits`, -1 when no hit is active. */
  readonly activeHitIndex: number;
  readonly progress: SearchProgress;
  readonly error: PluginErrorInfo | null;
}

/** The progress of no search, one object for every session that hasn't searched a page yet. */
export const NO_PROGRESS: SearchProgress = Object.freeze({ pagesSearched: 0, pageCount: 0 });

export const initialSearchState = (): SearchState => ({
  query: null,
  status: 'idle',
  operationId: null,
  hits: [],
  hitsByPage: {},
  activeHitIndex: -1,
  progress: NO_PROGRESS,
  error: null,
});

/** A new scan starts: everything from the previous session is dropped. */
export const startSession = (
  _state: SearchState,
  query: SearchQuery,
  operationId: string,
): SearchState => ({ ...initialSearchState(), query, status: 'searching', operationId });

const sameProgress = (left: SearchProgress, right: SearchProgress): boolean =>
  left.pagesSearched === right.pagesSearched && left.pageCount === right.pageCount;

/**
 * A slice of hits arrived. The first hit becomes active so "1 of N" reads
 * right; moving the camera is navigation's job, not the stream's. Progress
 * with the same counts keeps its object: readers, and `onProgressChanged`,
 * see a change only when the counts change.
 */
export function appendHits(
  state: SearchState,
  hits: readonly SearchHit[],
  slice: SearchProgress,
): SearchState {
  const progress = sameProgress(state.progress, slice) ? state.progress : slice;
  if (hits.length === 0) return progress === state.progress ? state : { ...state, progress };
  const hitsByPage: Record<number, readonly SearchHit[]> = { ...state.hitsByPage };
  for (const hit of hits) {
    const pageObjectNumber = hit.page.objectNumber;
    hitsByPage[pageObjectNumber] = [...(hitsByPage[pageObjectNumber] ?? []), hit];
  }
  return {
    ...state,
    hits: [...state.hits, ...hits],
    hitsByPage,
    activeHitIndex: state.activeHitIndex === -1 ? 0 : state.activeHitIndex,
    progress,
  };
}

export const completeSession = (state: SearchState): SearchState => ({
  ...state,
  status: 'complete',
});

export const cancelSession = (state: SearchState): SearchState => ({
  ...state,
  status: 'cancelled',
});

export const failSession = (state: SearchState, error: PluginErrorInfo): SearchState => ({
  ...state,
  status: 'error',
  error,
});

export const setActiveHit = (state: SearchState, index: number): SearchState =>
  state.activeHitIndex === index ? state : { ...state, activeHitIndex: index };

export const clearSession = (state: SearchState): SearchState =>
  state.status === 'idle' ? state : initialSearchState();

/**
 * Where `hit` is in `hits`: the same object, or else the hit that covers the
 * same characters of the same page, so a hit kept from before the search ran
 * again still finds its place. -1 when it isn't there.
 */
export function indexOfHit(hits: readonly SearchHit[], hit: SearchHit): number {
  const same = hits.indexOf(hit);
  if (same >= 0) return same;
  return hits.findIndex(
    (candidate) =>
      candidate.start === hit.start &&
      candidate.count === hit.count &&
      pageRefsEqual(candidate.page, hit.page),
  );
}

/**
 * The pages that have at least one hit, in document order: `pages` is the
 * document's page list, whose order moving a page changes (object numbers
 * don't follow it).
 */
export const pagesWithHits = (
  state: SearchState,
  pages: readonly { readonly ref: PageRef }[],
): readonly PageRef[] =>
  pages
    .filter((page) => (state.hitsByPage[page.ref.objectNumber]?.length ?? 0) > 0)
    .map((page) => page.ref);
