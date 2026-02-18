import { Reducer } from '@embedpdf/core';
import { LayoutAnalysisState } from './types';
import {
  LayoutAnalysisAction,
  INIT_LAYOUT_STATE,
  CLEANUP_LAYOUT_STATE,
  SET_PAGE_STATUS,
  SET_PAGE_LAYOUT,
  SET_PAGE_ERROR,
  SET_LAYOUT_OVERLAY_VISIBLE,
  SET_TABLE_STRUCTURE_OVERLAY_VISIBLE,
  SET_TABLE_STRUCTURE_ENABLED,
  SET_LAYOUT_THRESHOLD,
  SET_TABLE_STRUCTURE_THRESHOLD,
  SELECT_BLOCK,
  SET_PAGE_TABLE_STRUCTURES,
  CLEAR_PAGE_RESULTS,
  CLEAR_ALL_RESULTS,
} from './actions';

export const initialState: LayoutAnalysisState = {
  documents: {},
  layoutOverlayVisible: true,
  tableStructureOverlayVisible: true,
  tableStructureEnabled: false,
  selectedBlockId: null,
  layoutThreshold: 0.35,
  tableStructureThreshold: 0.8,
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
      const page = doc.pages[pageIndex] ?? {
        status: 'idle',
        layout: null,
        error: null,
        tableStructureAnalyzed: false,
      };
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
              [pageIndex]: {
                status: 'complete',
                layout,
                error: null,
                tableStructureAnalyzed: false,
              },
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
              [pageIndex]: { status: 'error', layout: null, error, tableStructureAnalyzed: false },
            },
          },
        },
      };
    }

    case CLEAR_PAGE_RESULTS: {
      const { documentId, pageIndex } = action.payload;
      const doc = state.documents[documentId];
      if (!doc) return state;
      const { [pageIndex]: _, ...restPages } = doc.pages;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: { ...doc, pages: restPages },
        },
      };
    }

    case CLEAR_ALL_RESULTS: {
      const { documentId } = action.payload;
      const doc = state.documents[documentId];
      if (!doc) return state;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: { ...doc, pages: {} },
        },
      };
    }

    case SET_PAGE_TABLE_STRUCTURES: {
      const { documentId, pageIndex, tableStructures } = action.payload;
      const doc = state.documents[documentId];
      if (!doc) return state;
      const page = doc.pages[pageIndex];
      if (!page?.layout) return state;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...doc,
            pages: {
              ...doc.pages,
              [pageIndex]: {
                ...page,
                layout: { ...page.layout, tableStructures },
                tableStructureAnalyzed: true,
              },
            },
          },
        },
      };
    }

    case SET_LAYOUT_OVERLAY_VISIBLE:
      return { ...state, layoutOverlayVisible: action.payload };

    case SET_TABLE_STRUCTURE_OVERLAY_VISIBLE:
      return { ...state, tableStructureOverlayVisible: action.payload };

    case SET_TABLE_STRUCTURE_ENABLED:
      return { ...state, tableStructureEnabled: action.payload };

    case SET_LAYOUT_THRESHOLD:
      return { ...state, layoutThreshold: action.payload };

    case SET_TABLE_STRUCTURE_THRESHOLD:
      return { ...state, tableStructureThreshold: action.payload };

    case SELECT_BLOCK:
      return { ...state, selectedBlockId: action.payload };

    default:
      return state;
  }
};
