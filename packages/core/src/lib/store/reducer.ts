import { Reducer } from './types';
import { CoreState, DocumentState } from './initial-state';
import {
  CoreAction,
  START_LOADING_DOCUMENT,
  UPDATE_DOCUMENT_LOADING_PROGRESS,
  SET_DOCUMENT_LOADED,
  SET_DOCUMENT_ERROR,
  RETRY_LOADING_DOCUMENT,
  CLOSE_DOCUMENT,
  SET_ACTIVE_DOCUMENT,
  SET_ROTATION,
  SET_SCALE,
  REFRESH_PAGES,
  REORDER_DOCUMENTS,
  MOVE_DOCUMENT,
} from './actions';
import { calculateNextActiveDocument, moveDocumentInOrder } from './reducer-helpers';

export const coreReducer: Reducer<CoreState, CoreAction> = (state, action): CoreState => {
  switch (action.type) {
    case START_LOADING_DOCUMENT: {
      const { documentId, name, scale, rotation, passwordProvided } = action.payload;

      const newDocState: DocumentState = {
        id: documentId,
        name,
        status: 'loading',
        loadingProgress: 0,
        error: null,
        document: null,
        scale: scale ?? state.defaultScale,
        rotation: rotation ?? state.defaultRotation,
        passwordProvided: passwordProvided ?? false,
        pageRefreshVersions: {},
        loadStartedAt: Date.now(),
      };

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: newDocState,
        },
        documentOrder: [...state.documentOrder, documentId],
        activeDocumentId: documentId,
      };
    }

    case UPDATE_DOCUMENT_LOADING_PROGRESS: {
      const { documentId, progress } = action.payload;
      const docState = state.documents[documentId];

      if (!docState || docState.status !== 'loading') return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            loadingProgress: progress,
          },
        },
      };
    }

    case SET_DOCUMENT_LOADED: {
      const { documentId, document } = action.payload;
      const docState = state.documents[documentId];

      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            status: 'loaded',
            document,
            error: null,
            errorCode: undefined,
            errorDetails: undefined,
            passwordProvided: undefined,
            loadedAt: Date.now(),
          },
        },
      };
    }

    case SET_DOCUMENT_ERROR: {
      const { documentId, error, errorCode, errorDetails } = action.payload;
      const docState = state.documents[documentId];

      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            status: 'error',
            error,
            errorCode,
            errorDetails,
          },
        },
      };
    }

    case RETRY_LOADING_DOCUMENT: {
      const { documentId, passwordProvided } = action.payload;
      const docState = state.documents[documentId];

      if (!docState || docState.status !== 'error') return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            status: 'loading',
            loadingProgress: 0,
            error: null,
            errorCode: undefined,
            errorDetails: undefined,
            passwordProvided: passwordProvided ?? false,
            loadStartedAt: Date.now(),
          },
        },
      };
    }

    case CLOSE_DOCUMENT: {
      const { documentId, nextActiveDocumentId } = action.payload;
      const { [documentId]: removed, ...remainingDocs } = state.documents;

      return {
        ...state,
        documents: remainingDocs,
        documentOrder: state.documentOrder.filter((id) => id !== documentId),
        activeDocumentId: calculateNextActiveDocument(state, documentId, nextActiveDocumentId),
      };
    }

    case MOVE_DOCUMENT: {
      const { documentId, toIndex } = action.payload;
      const newOrder = moveDocumentInOrder(state.documentOrder, documentId, toIndex);

      // If invalid, return unchanged state
      if (!newOrder) return state;

      return {
        ...state,
        documentOrder: newOrder,
      };
    }

    case REORDER_DOCUMENTS: {
      return {
        ...state,
        documentOrder: action.payload,
      };
    }

    case SET_ACTIVE_DOCUMENT: {
      return {
        ...state,
        activeDocumentId: action.payload,
      };
    }

    case SET_SCALE: {
      const { scale, documentId } = action.payload;
      const targetId = documentId ?? state.activeDocumentId;

      if (!targetId) return state;

      const docState = state.documents[targetId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [targetId]: {
            ...docState,
            scale,
          },
        },
      };
    }

    case SET_ROTATION: {
      const { rotation, documentId } = action.payload;
      const targetId = documentId ?? state.activeDocumentId;

      if (!targetId) return state;

      const docState = state.documents[targetId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [targetId]: {
            ...docState,
            rotation,
          },
        },
      };
    }

    case REFRESH_PAGES: {
      const { documentId, pageIndexes } = action.payload;
      const docState = state.documents[documentId];

      if (!docState) return state;

      // Convert 1-based page numbers to 0-based indices and increment versions
      const newVersions = { ...docState.pageRefreshVersions };
      for (const pageIndex of pageIndexes) {
        newVersions[pageIndex] = (newVersions[pageIndex] || 0) + 1;
      }

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            pageRefreshVersions: newVersions,
          },
        },
      };
    }

    default:
      return state;
  }
};
