import type { SearchAction, SearchState } from './types';

export const initialSearchState = (): SearchState => ({
  query: null,
  status: 'idle',
  hits: [],
  hitsByPage: {},
  activeIndex: -1,
  progress: { scanned: 0, total: 0 },
  error: null,
});

export const searchReducer = (state: SearchState, action: SearchAction): SearchState => {
  switch (action.type) {
    case 'START':
      return { ...initialSearchState(), query: action.query, status: 'searching' };
    case 'APPEND': {
      if (action.hits.length === 0) {
        return { ...state, progress: { scanned: action.scanned, total: action.total } };
      }
      const hits = state.hits.concat(action.hits);
      const hitsByPage = { ...state.hitsByPage };
      for (let i = state.hits.length; i < hits.length; i++) {
        const pon = hits[i].pon;
        hitsByPage[pon] = (hitsByPage[pon] ?? []).concat(i);
      }
      return {
        ...state,
        hits,
        hitsByPage,
        // The first hit becomes active (so "1/N" reads right) — navigation,
        // not the stream, moves the camera.
        activeIndex: state.activeIndex === -1 ? 0 : state.activeIndex,
        progress: { scanned: action.scanned, total: action.total },
      };
    }
    case 'COMPLETE':
      return { ...state, status: 'complete' };
    case 'ERROR':
      return { ...state, status: 'error', error: action.message };
    case 'SET_ACTIVE':
      return { ...state, activeIndex: action.index };
    case 'CLEAR':
      return initialSearchState();
    default:
      return state;
  }
};
