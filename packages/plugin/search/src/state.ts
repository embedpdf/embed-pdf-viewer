/**
 * The search page's State table as code: what `useSearchState()` returns, and
 * the same fields in every other framework. The matches themselves are not
 * here: `useSearchHits()` reads them, so a component that only shows the
 * count doesn't re-render for every match that arrives.
 */
import { defineState, type PluginErrorInfo } from '@embedpdf/core';
import type { SearchQuery } from '@embedpdf/engine-core/runtime';

import { SearchToken, type SearchHit, type SearchProgress, type SearchStatus } from './contract';
import { NO_PROGRESS } from './model';

/** The query, where the search is, how many hits it found, the active hit, and why it failed. */
export interface SearchState {
  /** What is searched for, or `null` before a search. */
  readonly query: SearchQuery | null;
  /** Where the search is: `idle`, `searching`, `complete`, `cancelled` or `error`. */
  readonly status: SearchStatus;
  /** How many hits were found so far. */
  readonly hitCount: number;
  /** The active hit's index, or `-1` when no hit is active. */
  readonly activeHitIndex: number;
  /** The active hit, or `null`. */
  readonly activeHit: SearchHit | null;
  /** How many pages the search went through, of how many. */
  readonly progress: SearchProgress;
  /** Why the search failed, or `null`. */
  readonly error: PluginErrorInfo | null;
}

export const searchState = defineState(SearchToken, {
  read: (search): SearchState => ({
    query: search.getQuery(),
    status: search.getStatus(),
    hitCount: search.getHitCount(),
    activeHitIndex: search.getActiveHitIndex(),
    activeHit: search.getActiveHit(),
    progress: search.getProgress(),
    error: search.getError(),
  }),
  empty: {
    query: null,
    status: 'idle',
    hitCount: 0,
    activeHitIndex: -1,
    activeHit: null,
    progress: NO_PROGRESS,
    error: null,
  },
});
