import { Reducer } from '@embedpdf/core';
import { FormDocumentState, FormState } from './types';
import {
  FormAction,
  INIT_FORM_STATE,
  CLEANUP_FORM_STATE,
  SET_FIELD_WIDGETS_BATCH,
  SELECT_FIELD,
  DESELECT_FIELD,
} from './actions';

export const initialDocumentState: FormDocumentState = {
  fieldWidgets: {},
  selectedFieldId: null,
};

export const initialState: FormState = {
  documents: {},
};

export const reducer: Reducer<FormState, FormAction> = (state = initialState, action) => {
  switch (action.type) {
    case INIT_FORM_STATE:
      return {
        ...state,
        documents: {
          ...state.documents,
          [action.payload.documentId]: action.payload.state,
        },
      };

    case CLEANUP_FORM_STATE: {
      const documentId = action.payload;
      const { [documentId]: _, ...remaining } = state.documents;
      return {
        ...state,
        documents: remaining,
      };
    }

    case SET_FIELD_WIDGETS_BATCH: {
      const { documentId, batch } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            fieldWidgets: {
              ...docState.fieldWidgets,
              ...batch,
            },
          },
        },
      };
    }

    case SELECT_FIELD: {
      const { documentId, annotationId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            selectedFieldId: annotationId,
          },
        },
      };
    }

    case DESELECT_FIELD: {
      const documentId = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            selectedFieldId: null,
          },
        },
      };
    }

    default:
      return state;
  }
};
