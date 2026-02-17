import { Reducer } from '@embedpdf/core';
import { LayoutAnalysisState } from './types';
import {
  LayoutAnalysisAction,
  INIT_LAYOUT_STATE,
  CLEANUP_LAYOUT_STATE,
  SET_PAGE_STATUS,
  SET_PAGE_LAYOUT,
  SET_PAGE_ERROR,
  SET_OVERLAY_VISIBLE,
  SET_THRESHOLD,
  SELECT_BLOCK,
} from './actions';

export const initialState: LayoutAnalysisState = {
  documents: {},
  overlayVisible: true,
  selectedBlockId: null,
  activeThreshold: 0.35,
};

export const reducer: Reducer<LayoutAnalysisState, LayoutAnalysisAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case INIT_LAYOUT_STATE: {
      const { documentId } = action.payload;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: { pages: {} },
        },
      };
    }

    case CLEANUP_LAYOUT_STATE: {
      const docId = action.payload;
      const { [docId]: _, ...rest } = state.documents;
      return { ...state, documents: rest };
    }

    case SET_PAGE_STATUS: {
      const { documentId, pageIndex, status } = action.payload;
      const doc = state.documents[documentId];
      if (!doc) return state;
      const page = doc.pages[pageIndex] ?? { status: 'idle', layout: null, error: null };
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...doc,
            pages: {
              ...doc.pages,
              [pageIndex]: { ...page, status },
            },
          },
        },
      };
    }

    case SET_PAGE_LAYOUT: {
      const { documentId, pageIndex, layout } = action.payload;
      const doc = state.documents[documentId];
      if (!doc) return state;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...doc,
            pages: {
              ...doc.pages,
              [pageIndex]: { status: 'complete', layout, error: null },
            },
          },
        },
      };
    }

    case SET_PAGE_ERROR: {
      const { documentId, pageIndex, error } = action.payload;
      const doc = state.documents[documentId];
      if (!doc) return state;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...doc,
            pages: {
              ...doc.pages,
              [pageIndex]: { status: 'error', layout: null, error },
            },
          },
        },
      };
    }

    case SET_OVERLAY_VISIBLE:
      return { ...state, overlayVisible: action.payload };

    case SET_THRESHOLD:
      return { ...state, activeThreshold: action.payload };

    case SELECT_BLOCK:
      return { ...state, selectedBlockId: action.payload };

    default:
      return state;
  }
};
