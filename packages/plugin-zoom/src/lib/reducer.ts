import { Reducer } from '@embedpdf/core';
import {
  ZoomAction,
  INIT_ZOOM_STATE,
  CLEANUP_ZOOM_STATE,
  SET_ACTIVE_DOCUMENT,
  SET_ZOOM_LEVEL,
  SET_MARQUEE_ZOOM_ACTIVE,
} from './actions';
import { ZoomState, ZoomDocumentState, ZoomMode } from './types';

export const initialDocumentState: ZoomDocumentState = {
  zoomLevel: ZoomMode.Automatic,
  currentZoomLevel: 1,
  isMarqueeZoomActive: false,
};

export const initialState: ZoomState = {
  documents: {},
  activeDocumentId: null,
};

export const zoomReducer: Reducer<ZoomState, ZoomAction> = (state = initialState, action) => {
  switch (action.type) {
    case INIT_ZOOM_STATE: {
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

    case CLEANUP_ZOOM_STATE: {
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

    case SET_ZOOM_LEVEL: {
      const { documentId, zoomLevel, currentZoomLevel } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            zoomLevel,
            currentZoomLevel,
          },
        },
      };
    }

    case SET_MARQUEE_ZOOM_ACTIVE: {
      const { documentId, isActive } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            isMarqueeZoomActive: isActive,
          },
        },
      };
    }

    default:
      return state;
  }
};
