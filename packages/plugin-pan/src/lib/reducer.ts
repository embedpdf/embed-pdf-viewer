import { Reducer } from '@embedpdf/core';
import {
  PanAction,
  INIT_PAN_STATE,
  CLEANUP_PAN_STATE,
  SET_ACTIVE_PAN_DOCUMENT,
  SET_PAN_MODE,
} from './actions';
import { PanState, PanDocumentState } from './types';

export const initialDocumentState: PanDocumentState = {
  isPanMode: false,
};

export const initialState: PanState = {
  documents: {},
  activeDocumentId: null,
};

export const panReducer: Reducer<PanState, PanAction> = (state = initialState, action) => {
  switch (action.type) {
    case INIT_PAN_STATE: {
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

    case CLEANUP_PAN_STATE: {
      const documentId = action.payload;
      const { [documentId]: removed, ...remainingDocs } = state.documents;
      return {
        ...state,
        documents: remainingDocs,
        activeDocumentId: state.activeDocumentId === documentId ? null : state.activeDocumentId,
      };
    }

    case SET_ACTIVE_PAN_DOCUMENT: {
      return {
        ...state,
        activeDocumentId: action.payload,
      };
    }

    case SET_PAN_MODE: {
      const { documentId, isPanMode } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            isPanMode,
          },
        },
      };
    }

    default:
      return state;
  }
};
