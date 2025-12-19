import { Reducer } from '@embedpdf/core';
import {
  SpreadAction,
  INIT_SPREAD_STATE,
  CLEANUP_SPREAD_STATE,
  SET_ACTIVE_SPREAD_DOCUMENT,
  SET_SPREAD_MODE,
  SET_PAGE_GROUPING,
} from './actions';
import { SpreadState, SpreadDocumentState, SpreadMode } from './types';

export const initialDocumentState: SpreadDocumentState = {
  spreadMode: SpreadMode.None,
};

export const initialState: SpreadState = {
  documents: {},
  activeDocumentId: null,
};

export const spreadReducer: Reducer<SpreadState, SpreadAction> = (state = initialState, action) => {
  switch (action.type) {
    case INIT_SPREAD_STATE: {
      const { documentId, state: docState } = action.payload;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: docState,
        },
        // Set as active if no active document
        activeDocumentId: state.activeDocumentId ?? documentId,
      };
    }

    case CLEANUP_SPREAD_STATE: {
      const documentId = action.payload;
      const { [documentId]: removed, ...remainingDocs } = state.documents;
      return {
        ...state,
        documents: remainingDocs,
        activeDocumentId: state.activeDocumentId === documentId ? null : state.activeDocumentId,
      };
    }

    case SET_ACTIVE_SPREAD_DOCUMENT: {
      return {
        ...state,
        activeDocumentId: action.payload,
      };
    }

    case SET_SPREAD_MODE: {
      const { documentId, spreadMode } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            spreadMode,
          },
        },
      };
    }

    case SET_PAGE_GROUPING: {
      const { documentId, grouping } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            pageGrouping: grouping,
          },
        },
      };
    }

    default:
      return state;
  }
};
