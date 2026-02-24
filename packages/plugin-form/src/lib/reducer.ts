import { Reducer } from '@embedpdf/core';
import { FormDocumentState, FormState } from './types';
import { FormAction, INIT_FORM_STATE, CLEANUP_FORM_STATE } from './actions';

export const initialDocumentState: FormDocumentState = {};

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

    default:
      return state;
  }
};
