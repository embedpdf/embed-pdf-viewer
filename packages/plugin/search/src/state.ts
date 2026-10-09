/**
 * The search page's State table as code: what `useSearchState()` returns, and
 * the same fields in every other framework. The matches themselves are not
 * here: `useSearchHits()` reads them, so a component that only shows the
 * count doesn't re-render for every match that arrives.
 */
import { defineState } from '@embedpdf/core';

import { SearchToken } from './contract';
import { NO_PROGRESS } from './model';

export const searchState = defineState(SearchToken, {
  read: (search) => ({
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
