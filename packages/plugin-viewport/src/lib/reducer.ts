import { Reducer } from '@embedpdf/core';
import {
  ViewportAction,
  INIT_VIEWPORT_STATE,
  CLEANUP_VIEWPORT_STATE,
  REGISTER_VIEWPORT,
  UNREGISTER_VIEWPORT,
  SET_ACTIVE_VIEWPORT_DOCUMENT,
  SET_VIEWPORT_METRICS,
  SET_VIEWPORT_SCROLL_METRICS,
  SET_VIEWPORT_GAP,
  SET_SCROLL_ACTIVITY,
  SET_SMOOTH_SCROLL_ACTIVITY,
  GATE_VIEWPORT,
  RELEASE_VIEWPORT_GATE,
} from './actions';
import { ViewportState, ViewportDocumentState } from './types';

const initialViewportDocumentState: ViewportDocumentState = {
  viewportMetrics: {
    width: 0,
    height: 0,
    scrollTop: 0,
    scrollLeft: 0,
    clientWidth: 0,
    clientHeight: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    relativePosition: { x: 0, y: 0 },
  },
  isScrolling: false,
  isSmoothScrolling: false,
  isGated: false,
};

export const initialState: ViewportState = {
  viewportGap: 0,
  documents: {},
  activeViewports: new Set(),
  activeDocumentId: null,
};

export const viewportReducer: Reducer<ViewportState, ViewportAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    // ─────────────────────────────────────────────────────────
    // State Persistence (Document Lifecycle)
    // ─────────────────────────────────────────────────────────

    case INIT_VIEWPORT_STATE: {
      const { documentId } = action.payload;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: initialViewportDocumentState,
        },
      };
    }

    case CLEANUP_VIEWPORT_STATE: {
      const { documentId } = action.payload;
      const { [documentId]: removed, ...remainingDocs } = state.documents;

      // Also remove from active viewports if present
      const newActiveViewports = new Set(state.activeViewports);
      newActiveViewports.delete(documentId);

      return {
        ...state,
        documents: remainingDocs,
        activeViewports: newActiveViewports,
        activeDocumentId: state.activeDocumentId === documentId ? null : state.activeDocumentId,
      };
    }

    // ─────────────────────────────────────────────────────────
    // Viewport Registration (DOM Lifecycle)
    // ─────────────────────────────────────────────────────────

    case REGISTER_VIEWPORT: {
      const { documentId } = action.payload;
      const newActiveViewports = new Set(state.activeViewports);
      newActiveViewports.add(documentId);

      return {
        ...state,
        activeViewports: newActiveViewports,
        // Set as active if no active document
        activeDocumentId: state.activeDocumentId ?? documentId,
      };
    }

    case UNREGISTER_VIEWPORT: {
      const { documentId } = action.payload;
      const newActiveViewports = new Set(state.activeViewports);
      newActiveViewports.delete(documentId);

      return {
        ...state,
        activeViewports: newActiveViewports,
      };
    }

    case SET_ACTIVE_VIEWPORT_DOCUMENT: {
      return {
        ...state,
        activeDocumentId: action.payload,
      };
    }

    // ─────────────────────────────────────────────────────────
    // Viewport Operations
    // ─────────────────────────────────────────────────────────

    case SET_VIEWPORT_GAP: {
      return {
        ...state,
        viewportGap: action.payload,
      };
    }

    case SET_VIEWPORT_METRICS: {
      const { documentId, metrics } = action.payload;
      const viewport = state.documents[documentId];
      if (!viewport) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...viewport,
            viewportMetrics: {
              width: metrics.width,
              height: metrics.height,
              scrollTop: metrics.scrollTop,
              scrollLeft: metrics.scrollLeft,
              clientWidth: metrics.clientWidth,
              clientHeight: metrics.clientHeight,
              scrollWidth: metrics.scrollWidth,
              scrollHeight: metrics.scrollHeight,
              relativePosition: {
                x:
                  metrics.scrollWidth <= metrics.clientWidth
                    ? 0
                    : metrics.scrollLeft / (metrics.scrollWidth - metrics.clientWidth),
                y:
                  metrics.scrollHeight <= metrics.clientHeight
                    ? 0
                    : metrics.scrollTop / (metrics.scrollHeight - metrics.clientHeight),
              },
            },
          },
        },
      };
    }

    case SET_VIEWPORT_SCROLL_METRICS: {
      const { documentId, scrollMetrics } = action.payload;
      const viewport = state.documents[documentId];
      if (!viewport) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...viewport,
            viewportMetrics: {
              ...viewport.viewportMetrics,
              scrollTop: scrollMetrics.scrollTop,
              scrollLeft: scrollMetrics.scrollLeft,
            },
            isScrolling: true,
          },
        },
      };
    }

    case SET_SCROLL_ACTIVITY: {
      const { documentId, isScrolling } = action.payload;
      const viewport = state.documents[documentId];
      if (!viewport) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...viewport,
            isScrolling,
          },
        },
      };
    }

    case SET_SMOOTH_SCROLL_ACTIVITY: {
      const { documentId, isSmoothScrolling } = action.payload;
      const viewport = state.documents[documentId];
      if (!viewport) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...viewport,
            isSmoothScrolling,
          },
        },
      };
    }

    case GATE_VIEWPORT: {
      const { documentId } = action.payload;
      const viewport = state.documents[documentId];
      if (!viewport) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...viewport,
            isGated: true,
          },
        },
      };
    }

    case RELEASE_VIEWPORT_GATE: {
      const { documentId } = action.payload;
      const viewport = state.documents[documentId];
      if (!viewport) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...viewport,
            isGated: false,
          },
        },
      };
    }

    default:
      return state;
  }
};
