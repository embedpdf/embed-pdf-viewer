/**
 * The search session: the query, the hits found so far (also grouped by
 * page), the active hit, and progress. Every function below is a pure
 * transition; the controller applies them with `ctx.state.update`.
 */
import type { PageRef, PluginErrorInfo } from '@embedpdf/core';
import type { SearchQuery } from '@embedpdf/engine-core/runtime';

import type { SearchHit, SearchProgress, SearchStatus } from './contract';

export interface SearchState {
  /** The query being searched, as the engine matches it. Null when idle. */
  readonly query: SearchQuery | null;
  readonly status: SearchStatus;
  readonly operationId: string | null;
  readonly hits: readonly SearchHit[];
  /** Page object number → the hits on that page; a page's array is replaced only when it gains hits. */
  readonly hitsByPage: Readonly<Record<number, readonly SearchHit[]>>;
  /** Index into `hits`, -1 when no hit is active. */
  readonly activeIndex: number;
  readonly progress: SearchProgress;
  readonly error: PluginErrorInfo | null;
}

export const initialSearchState = (): SearchState => ({
  query: null,
  status: 'idle',
  operationId: null,
  hits: [],
  hitsByPage: {},
  activeIndex: -1,
  progress: { scanned: 0, total: 0 },
  error: null,
});

/** A new scan starts: everything from the previous session is dropped. */
export const startSession = (
  _state: SearchState,
  query: SearchQuery,
  operationId: string,
): SearchState => ({ ...initialSearchState(), query, status: 'searching', operationId });

/**
 * A slice of hits arrived. The first hit becomes active so "1 of N" reads
 * right; moving the camera is navigation's job, not the stream's.
 */
export function appendHits(
  state: SearchState,
  hits: readonly SearchHit[],
  progress: SearchProgress,
): SearchState {
  if (hits.length === 0) return { ...state, progress };
  const hitsByPage: Record<number, readonly SearchHit[]> = { ...state.hitsByPage };
  for (const hit of hits) {
    const pageObjectNumber = hit.page.pageObjectNumber;
    hitsByPage[pageObjectNumber] = [...(hitsByPage[pageObjectNumber] ?? []), hit];
  }
  return {
    ...state,
    hits: [...state.hits, ...hits],
    hitsByPage,
    activeIndex: state.activeIndex === -1 ? 0 : state.activeIndex,
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
  state.activeIndex === index ? state : { ...state, activeIndex: index };

export const clearSession = (state: SearchState): SearchState =>
  state.status === 'idle' ? state : initialSearchState();

/** The pages that have at least one hit, in the order they were found. */
export const pagesWithHits = (state: SearchState): readonly PageRef[] =>
  Object.values(state.hitsByPage)
    .filter((hits) => hits.length > 0)
    .map((hits) => hits[0].page);
