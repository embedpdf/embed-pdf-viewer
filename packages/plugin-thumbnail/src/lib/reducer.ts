import { Reducer } from '@embedpdf/core';
import {
  ThumbnailAction,
  INIT_THUMBNAIL_STATE,
  CLEANUP_THUMBNAIL_STATE,
  SET_ACTIVE_DOCUMENT,
  SET_WINDOW_STATE,
  UPDATE_VIEWPORT_METRICS,
} from './actions';
import { ThumbnailState, ThumbnailDocumentState } from './types';

export const initialDocumentState: ThumbnailDocumentState = {
  thumbs: [],
  window: null,
  viewportH: 0,
  scrollY: 0,
};

export const initialState: ThumbnailState = {
  documents: {},
  activeDocumentId: null,
};

export const thumbnailReducer: Reducer<ThumbnailState, ThumbnailAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case INIT_THUMBNAIL_STATE: {
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

    case CLEANUP_THUMBNAIL_STATE: {
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

    case SET_WINDOW_STATE: {
      const { documentId, window } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            window,
          },
        },
      };
    }

    case UPDATE_VIEWPORT_METRICS: {
      const { documentId, scrollY, viewportH } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            scrollY,
            viewportH,
          },
        },
      };
    }

    default:
      return state;
  }
};
