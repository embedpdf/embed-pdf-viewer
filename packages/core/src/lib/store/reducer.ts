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
  SET_PAGES,
  SET_ROTATION,
  SET_SCALE,
} from './actions';

export const coreReducer: Reducer<CoreState, CoreAction> = (state, action): CoreState => {
  switch (action.type) {
    case START_LOADING_DOCUMENT: {
      const { documentId, scale, rotation } = action.payload;

      const newDocState: DocumentState = {
        id: documentId,
        status: 'loading',
        loadingProgress: 0,
        error: null,
        document: null,
        pages: [],
        scale: scale ?? state.defaultScale,
        rotation: rotation ?? state.defaultRotation,
        loadStartedAt: Date.now(),
      };

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: newDocState,
        },
        // Set as active if no active document
        activeDocumentId: state.activeDocumentId ?? documentId,
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
            pages: document.pages.map((page) => [page]),
            error: null,
            errorCode: undefined,
            errorDetails: undefined,
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
      const { documentId } = action.payload;
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
            loadStartedAt: Date.now(),
          },
        },
      };
    }

    case CLOSE_DOCUMENT: {
      const { documentId } = action.payload;
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

    case SET_PAGES: {
      const { documentId, pages } = action.payload;
      const docState = state.documents[documentId];

      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            pages,
          },
        },
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

    default:
      return state;
  }
};
