import type { PageRef, PluginErrorInfo } from '@embedpdf/core';
import type { SearchQuery } from '@embedpdf/engine-core/runtime';
import type { SearchHit, SearchProgress, SearchStatus } from './contract';

export interface SearchState {
  /** The stored search intent, the same flat `SearchQuery` the engine matches on. Null when idle. */
  readonly query: SearchQuery | null;
  readonly status: SearchStatus;
  readonly operationId: string | null;
  readonly hits: readonly SearchHit[];
  /** page object number → the hits on that page; each array is replaced only when that page gains hits. */
  readonly hitsByPage: Readonly<Record<number, readonly SearchHit[]>>;
  /** Index into `hits`, -1 = none. */
  readonly activeIndex: number;
  readonly progress: SearchProgress;
  readonly error: PluginErrorInfo | null;
}

export type SearchAction =
  | { type: 'START'; query: SearchQuery; operationId: string }
  | { type: 'APPEND'; hits: readonly SearchHit[]; scanned: number; total: number }
  | { type: 'COMPLETE' }
  | { type: 'CANCELLED' }
  | { type: 'ERROR'; error: PluginErrorInfo }
  | { type: 'SET_ACTIVE'; index: number }
  | { type: 'CLEAR' };

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

export function reduceSearch(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'START':
      return {
        ...initialSearchState(),
        query: action.query,
        status: 'searching',
        operationId: action.operationId,
      };
    case 'APPEND': {
      const progress = { scanned: action.scanned, total: action.total };
      if (action.hits.length === 0) return { ...state, progress };
      const hitsByPage: Record<number, readonly SearchHit[]> = { ...state.hitsByPage };
      for (const hit of action.hits) {
        const key = hit.page.pageObjectNumber;
        hitsByPage[key] = [...(hitsByPage[key] ?? []), hit];
      }
      return {
        ...state,
        hits: [...state.hits, ...action.hits],
        hitsByPage,
        // The first hit becomes active so "1/N" reads right; navigation, not the stream, moves the camera.
        activeIndex: state.activeIndex === -1 ? 0 : state.activeIndex,
        progress,
      };
    }
    case 'COMPLETE':
      return { ...state, status: 'complete' };
    case 'CANCELLED':
      return { ...state, status: 'cancelled' };
    case 'ERROR':
      return { ...state, status: 'error', error: action.error };
    case 'SET_ACTIVE':
      return state.activeIndex === action.index ? state : { ...state, activeIndex: action.index };
    case 'CLEAR':
      return initialSearchState();
    default:
      return state;
  }
}

export const pagesWithHits = (state: SearchState): readonly PageRef[] =>
  Object.values(state.hitsByPage)
    .filter((hits) => hits.length > 0)
    .map((hits) => hits[0].page);
