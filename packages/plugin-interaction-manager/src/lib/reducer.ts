import { Reducer } from '@embedpdf/core';
import {
  InteractionManagerAction,
  INIT_INTERACTION_STATE,
  CLEANUP_INTERACTION_STATE,
  SET_ACTIVE_DOCUMENT,
  ACTIVATE_MODE,
  PAUSE_INTERACTION,
  RESUME_INTERACTION,
  SET_CURSOR,
  SET_DEFAULT_MODE,
  SET_EXCLUSION_RULES,
  ADD_EXCLUSION_CLASS,
  REMOVE_EXCLUSION_CLASS,
  ADD_EXCLUSION_ATTRIBUTE,
  REMOVE_EXCLUSION_ATTRIBUTE,
} from './actions';
import { InteractionManagerState, InteractionDocumentState } from './types';

const INITIAL_MODE = 'pointerMode';

export const initialDocumentState: InteractionDocumentState = {
  activeMode: INITIAL_MODE,
  cursor: 'auto',
  paused: false,
};

export const initialState: InteractionManagerState = {
  defaultMode: INITIAL_MODE,
  exclusionRules: {
    classes: [],
    dataAttributes: ['data-no-interaction'],
  },
  documents: {},
  activeDocumentId: null,
};

export const reducer: Reducer<InteractionManagerState, InteractionManagerAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    // ─────────────────────────────────────────────────────────
    // Document Lifecycle
    // ─────────────────────────────────────────────────────────
    case INIT_INTERACTION_STATE: {
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

    case CLEANUP_INTERACTION_STATE: {
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

    // ─────────────────────────────────────────────────────────
    // Per-Document Actions
    // ─────────────────────────────────────────────────────────
    case ACTIVATE_MODE: {
      const { documentId, mode } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            activeMode: mode,
          },
        },
      };
    }

    case SET_CURSOR: {
      const { documentId, cursor } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            cursor,
          },
        },
      };
    }

    case PAUSE_INTERACTION: {
      const documentId = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            paused: true,
          },
        },
      };
    }

    case RESUME_INTERACTION: {
      const documentId = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            paused: false,
          },
        },
      };
    }

    // ─────────────────────────────────────────────────────────
    // Global Actions
    // ─────────────────────────────────────────────────────────
    case SET_DEFAULT_MODE:
      return {
        ...state,
        defaultMode: action.payload.mode,
      };

    case SET_EXCLUSION_RULES:
      return {
        ...state,
        exclusionRules: action.payload.rules,
      };

    case ADD_EXCLUSION_CLASS:
      return {
        ...state,
        exclusionRules: {
          ...state.exclusionRules,
          classes: [...(state.exclusionRules.classes || []), action.payload.className].filter(
            (v, i, a) => a.indexOf(v) === i,
          ),
        },
      };

    case REMOVE_EXCLUSION_CLASS:
      return {
        ...state,
        exclusionRules: {
          ...state.exclusionRules,
          classes: (state.exclusionRules.classes || []).filter(
            (c) => c !== action.payload.className,
          ),
        },
      };

    case ADD_EXCLUSION_ATTRIBUTE:
      return {
        ...state,
        exclusionRules: {
          ...state.exclusionRules,
          dataAttributes: [
            ...(state.exclusionRules.dataAttributes || []),
            action.payload.attribute,
          ].filter((v, i, a) => a.indexOf(v) === i),
        },
      };

    case REMOVE_EXCLUSION_ATTRIBUTE:
      return {
        ...state,
        exclusionRules: {
          ...state.exclusionRules,
          dataAttributes: (state.exclusionRules.dataAttributes || []).filter(
            (a) => a !== action.payload.attribute,
          ),
        },
      };

    default:
      return state;
  }
};
