import { Reducer } from '@embedpdf/core';
import {
  HistoryAction,
  INIT_HISTORY_STATE,
  CLEANUP_HISTORY_STATE,
  SET_HISTORY_DOCUMENT_STATE,
  SET_ACTIVE_HISTORY_DOCUMENT,
} from './actions';
import { HistoryState, HistoryDocumentState } from './types';

const initialDocumentState: HistoryDocumentState = {
  global: {
    canUndo: false,
    canRedo: false,
  },
  topics: {},
};

export const initialState: HistoryState = {
  documents: {},
  activeDocumentId: null,
};

export const reducer: Reducer<HistoryState, HistoryAction> = (state = initialState, action) => {
  switch (action.type) {
    case INIT_HISTORY_STATE: {
      const { documentId } = action.payload;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: { ...initialDocumentState },
        },
      };
    }

    case CLEANUP_HISTORY_STATE: {
      const { documentId } = action.payload;
      const { [documentId]: removed, ...remainingDocs } = state.documents;

      return {
        ...state,
        documents: remainingDocs,
        activeDocumentId: state.activeDocumentId === documentId ? null : state.activeDocumentId,
      };
    }

    case SET_HISTORY_DOCUMENT_STATE: {
      const { documentId, state: docState } = action.payload;
      if (!state.documents[documentId]) {
        return state;
      }

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: docState,
        },
      };
    }

    case SET_ACTIVE_HISTORY_DOCUMENT: {
      return {
        ...state,
        activeDocumentId: action.payload,
      };
    }

    default:
      return state;
  }
};
