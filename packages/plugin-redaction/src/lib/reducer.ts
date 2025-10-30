import { Reducer } from '@embedpdf/core';
import { RedactionItem, RedactionState, RedactionDocumentState } from './types';
import {
  RedactionAction,
  INIT_REDACTION_STATE,
  CLEANUP_REDACTION_STATE,
  SET_ACTIVE_DOCUMENT,
  ADD_PENDING,
  CLEAR_PENDING,
  END_REDACTION,
  REMOVE_PENDING,
  START_REDACTION,
  SET_ACTIVE_TYPE,
  SELECT_PENDING,
  DESELECT_PENDING,
} from './actions';

// Helper function to calculate total pending count
const calculatePendingCount = (pending: Record<number, RedactionItem[]>): number => {
  return Object.values(pending).reduce((total, items) => total + items.length, 0);
};

export const initialDocumentState: RedactionDocumentState = {
  isRedacting: false,
  activeType: null,
  pending: {},
  pendingCount: 0,
  selected: null,
};

export const initialState: RedactionState = {
  documents: {},
  activeDocumentId: null,
};

export const redactionReducer: Reducer<RedactionState, RedactionAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case INIT_REDACTION_STATE: {
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

    case CLEANUP_REDACTION_STATE: {
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

    case ADD_PENDING: {
      const { documentId, items } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const next = { ...docState.pending };
      for (const item of items) {
        next[item.page] = (next[item.page] ?? []).concat(item);
      }

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            pending: next,
            pendingCount: calculatePendingCount(next),
          },
        },
      };
    }

    case REMOVE_PENDING: {
      const { documentId, page, id } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const list = docState.pending[page] ?? [];
      const filtered = list.filter((it) => it.id !== id);
      const next = { ...docState.pending, [page]: filtered };

      // if the removed one was selected → clear selection
      const stillSelected =
        docState.selected && !(docState.selected.page === page && docState.selected.id === id);

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            pending: next,
            pendingCount: calculatePendingCount(next),
            selected: stillSelected ? docState.selected : null,
          },
        },
      };
    }

    case CLEAR_PENDING: {
      const documentId = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            pending: {},
            pendingCount: 0,
            selected: null,
          },
        },
      };
    }

    case SELECT_PENDING: {
      const { documentId, page, id } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            selected: { page, id },
          },
        },
      };
    }

    case DESELECT_PENDING: {
      const documentId = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            selected: null,
          },
        },
      };
    }

    case START_REDACTION: {
      const { documentId, mode } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            isRedacting: true,
            activeType: mode,
          },
        },
      };
    }

    case END_REDACTION: {
      const documentId = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            pending: {},
            pendingCount: 0,
            selected: null,
            isRedacting: false,
            activeType: null,
          },
        },
      };
    }

    case SET_ACTIVE_TYPE: {
      const { documentId, mode } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activeType: mode,
          },
        },
      };
    }

    default:
      return state;
  }
};
