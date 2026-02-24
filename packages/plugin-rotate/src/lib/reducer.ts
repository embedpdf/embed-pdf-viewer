import { Reducer } from '@embedpdf/core';
import {
  RotateAction,
  INIT_ROTATE_STATE,
  CLEANUP_ROTATE_STATE,
  SET_ACTIVE_ROTATE_DOCUMENT,
  SET_ROTATION,
} from './actions';
import { RotateState, RotateDocumentState } from './types';

export const initialDocumentState: RotateDocumentState = {
  rotation: 0,
};

export const initialState: RotateState = {
  documents: {},
  activeDocumentId: null,
};

export const rotateReducer: Reducer<RotateState, RotateAction> = (state = initialState, action) => {
  switch (action.type) {
    case INIT_ROTATE_STATE: {
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

    case CLEANUP_ROTATE_STATE: {
      const documentId = action.payload;
      const { [documentId]: removed, ...remainingDocs } = state.documents;
      return {
        ...state,
        documents: remainingDocs,
        activeDocumentId: state.activeDocumentId === documentId ? null : state.activeDocumentId,
      };
    }

    case SET_ACTIVE_ROTATE_DOCUMENT: {
      return {
        ...state,
        activeDocumentId: action.payload,
      };
    }

    case SET_ROTATION: {
      const { documentId, rotation } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            rotation,
          },
        },
      };
    }

    default:
      return state;
  }
};
