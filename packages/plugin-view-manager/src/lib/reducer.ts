import { Reducer } from '@embedpdf/core';
import { ViewManagerState } from './types';
import {
  ViewManagerAction,
  CREATE_VIEW,
  REMOVE_VIEW,
  SET_FOCUSED_VIEW,
  ADD_DOCUMENT_TO_VIEW,
  REMOVE_DOCUMENT_FROM_VIEW,
  MOVE_DOCUMENT_WITHIN_VIEW,
  SET_VIEW_ACTIVE_DOCUMENT,
} from './actions';

export const initialState: ViewManagerState = {
  views: {},
  viewOrder: [],
  focusedViewId: null,
};

export const viewManagerReducer: Reducer<ViewManagerState, ViewManagerAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case CREATE_VIEW: {
      const { viewId, createdAt } = action.payload;

      if (state.views[viewId]) {
        return state;
      }

      return {
        ...state,
        views: {
          ...state.views,
          [viewId]: {
            id: viewId,
            documentIds: [],
            activeDocumentId: null,
            createdAt,
          },
        },
        viewOrder: [...state.viewOrder, viewId],
        focusedViewId: state.focusedViewId ?? viewId,
      };
    }

    case REMOVE_VIEW: {
      const viewId = action.payload;
      const { [viewId]: removed, ...remainingViews } = state.views;

      let newFocusedViewId = state.focusedViewId;
      if (state.focusedViewId === viewId) {
        const remainingIds = state.viewOrder.filter((id) => id !== viewId);
        newFocusedViewId = remainingIds.length > 0 ? remainingIds[0] : null;
      }

      return {
        ...state,
        views: remainingViews,
        viewOrder: state.viewOrder.filter((id) => id !== viewId),
        focusedViewId: newFocusedViewId,
      };
    }

    case ADD_DOCUMENT_TO_VIEW: {
      const { viewId, documentId, index } = action.payload;
      const view = state.views[viewId];

      if (!view) return state;

      // Remove document from any other view first
      const updatedViews = { ...state.views };
      for (const vid in updatedViews) {
        if (updatedViews[vid].documentIds.includes(documentId)) {
          updatedViews[vid] = {
            ...updatedViews[vid],
            documentIds: updatedViews[vid].documentIds.filter((id) => id !== documentId),
            // If we removed the active document, clear it
            activeDocumentId:
              updatedViews[vid].activeDocumentId === documentId
                ? updatedViews[vid].documentIds.length > 1
                  ? updatedViews[vid].documentIds.find((id) => id !== documentId) || null
                  : null
                : updatedViews[vid].activeDocumentId,
          };
        }
      }

      // Add to target view
      const newDocumentIds = [...updatedViews[viewId].documentIds];
      if (index !== undefined && index >= 0 && index <= newDocumentIds.length) {
        newDocumentIds.splice(index, 0, documentId);
      } else {
        newDocumentIds.push(documentId);
      }

      updatedViews[viewId] = {
        ...updatedViews[viewId],
        documentIds: newDocumentIds,
        // Auto-set as active if it's the first document or no active document
        activeDocumentId: updatedViews[viewId].activeDocumentId || documentId,
      };

      return {
        ...state,
        views: updatedViews,
      };
    }

    case REMOVE_DOCUMENT_FROM_VIEW: {
      const { viewId, documentId } = action.payload;
      const view = state.views[viewId];

      if (!view || !view.documentIds.includes(documentId)) return state;

      const newDocumentIds = view.documentIds.filter((id) => id !== documentId);

      // Calculate new active document
      let newActiveDocumentId = view.activeDocumentId;
      if (view.activeDocumentId === documentId) {
        newActiveDocumentId = newDocumentIds.length > 0 ? newDocumentIds[0] : null;
      }

      return {
        ...state,
        views: {
          ...state.views,
          [viewId]: {
            ...view,
            documentIds: newDocumentIds,
            activeDocumentId: newActiveDocumentId,
          },
        },
      };
    }

    case MOVE_DOCUMENT_WITHIN_VIEW: {
      const { viewId, documentId, toIndex } = action.payload;
      const view = state.views[viewId];

      if (!view || !view.documentIds.includes(documentId)) return state;

      const fromIndex = view.documentIds.indexOf(documentId);
      if (fromIndex === toIndex) return state;

      const newDocumentIds = [...view.documentIds];
      newDocumentIds.splice(fromIndex, 1);
      newDocumentIds.splice(toIndex, 0, documentId);

      return {
        ...state,
        views: {
          ...state.views,
          [viewId]: {
            ...view,
            documentIds: newDocumentIds,
          },
        },
      };
    }

    case SET_VIEW_ACTIVE_DOCUMENT: {
      const { viewId, documentId } = action.payload;
      const view = state.views[viewId];

      if (!view) return state;
      if (documentId !== null && !view.documentIds.includes(documentId)) return state;

      return {
        ...state,
        views: {
          ...state.views,
          [viewId]: {
            ...view,
            activeDocumentId: documentId,
          },
        },
      };
    }

    case SET_FOCUSED_VIEW: {
      const viewId = action.payload;

      if (viewId !== null && !state.views[viewId]) {
        return state;
      }

      return {
        ...state,
        focusedViewId: viewId,
      };
    }

    default:
      return state;
  }
};
