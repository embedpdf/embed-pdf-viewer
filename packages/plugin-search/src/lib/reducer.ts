import { Reducer } from '@embedpdf/core';
import { SearchDocumentState, SearchState } from './types';
import {
  START_SEARCH_SESSION,
  STOP_SEARCH_SESSION,
  SET_SEARCH_FLAGS,
  SET_SHOW_ALL_RESULTS,
  START_SEARCH,
  SET_SEARCH_RESULTS,
  APPEND_SEARCH_RESULTS,
  SET_ACTIVE_RESULT_INDEX,
  SearchAction,
  INIT_SEARCH_STATE,
  CLEANUP_SEARCH_STATE,
} from './actions';
import { MatchFlag } from '@embedpdf/models';

export const initialSearchDocumentState: SearchDocumentState = {
  flags: [] as MatchFlag[],
  results: [],
  total: 0,
  activeResultIndex: -1,
  showAllResults: true,
  query: '',
  loading: false,
  active: false,
};

export const initialState: SearchState = {
  documents: {},
};

const updateDocState = (
  state: SearchState,
  documentId: string,
  newDocState: Partial<SearchDocumentState>,
): SearchState => {
  const oldDocState = state.documents[documentId] || initialSearchDocumentState;
  return {
    ...state,
    documents: {
      ...state.documents,
      [documentId]: {
        ...oldDocState,
        ...newDocState,
      },
    },
  };
};

export const searchReducer: Reducer<SearchState, SearchAction> = (state = initialState, action) => {
  switch (action.type) {
    case INIT_SEARCH_STATE:
      return {
        ...state,
        documents: {
          ...state.documents,
          [action.payload.documentId]: action.payload.state,
        },
      };

    case CLEANUP_SEARCH_STATE: {
      const documentId = action.payload;
      const { [documentId]: removed, ...remaining } = state.documents;
      return {
        ...state,
        documents: remaining,
      };
    }

    case START_SEARCH_SESSION:
      return updateDocState(state, action.payload.documentId, { active: true });

    case STOP_SEARCH_SESSION:
      return updateDocState(state, action.payload.documentId, {
        results: [],
        total: 0,
        activeResultIndex: -1,
        query: '',
        loading: false,
        active: false,
      });

    case SET_SEARCH_FLAGS:
      return updateDocState(state, action.payload.documentId, { flags: action.payload.flags });

    case SET_SHOW_ALL_RESULTS:
      return updateDocState(state, action.payload.documentId, {
        showAllResults: action.payload.showAll,
      });

    case START_SEARCH:
      return updateDocState(state, action.payload.documentId, {
        loading: true,
        query: action.payload.query,
        // clear old results on new search start
        results: [],
        total: 0,
        activeResultIndex: -1,
      });

    case APPEND_SEARCH_RESULTS: {
      const { documentId, results } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const newResults = [...docState.results, ...results];
      const firstHitIndex =
        docState.activeResultIndex === -1 && newResults.length > 0 ? 0 : docState.activeResultIndex;
      return updateDocState(state, documentId, {
        results: newResults,
        total: newResults.length, // total-so-far
        activeResultIndex: firstHitIndex,
        // keep loading true until final SET_SEARCH_RESULTS
        loading: true,
      });
    }

    case SET_SEARCH_RESULTS: {
      const { documentId, results, total, activeResultIndex } = action.payload;
      return updateDocState(state, documentId, {
        results,
        total,
        activeResultIndex,
        loading: false,
      });
    }

    case SET_ACTIVE_RESULT_INDEX:
      return updateDocState(state, action.payload.documentId, {
        activeResultIndex: action.payload.index,
      });

    default:
      return state;
  }
};
