import { Reducer } from '@embedpdf/core';
import {
  CaptureAction,
  INIT_CAPTURE_STATE,
  CLEANUP_CAPTURE_STATE,
  SET_ACTIVE_DOCUMENT,
  SET_MARQUEE_CAPTURE_ACTIVE,
} from './actions';
import { CaptureState, CaptureDocumentState } from './types';

export const initialDocumentState: CaptureDocumentState = {
  isMarqueeCaptureActive: false,
};

export const initialState: CaptureState = {
  documents: {},
  activeDocumentId: null,
};

export const captureReducer: Reducer<CaptureState, CaptureAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case INIT_CAPTURE_STATE: {
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

    case CLEANUP_CAPTURE_STATE: {
      const documentId = action.payload;
      const { [documentId]: removed, ...remainingDocs } = state.documents;
      return {
        ...state,
        documents: remainingDocs,
        activeDocumentId: state.activeDocumentId === documentId ? null : state.activeDocumentId,
      };
    }

    case SET_ACTIVE_DOCUMENT: {
      return {
        ...state,
        activeDocumentId: action.payload,
      };
    }

    case SET_MARQUEE_CAPTURE_ACTIVE: {
      const { documentId, isActive } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            isMarqueeCaptureActive: isActive,
          },
        },
      };
    }

    default:
      return state;
  }
};
