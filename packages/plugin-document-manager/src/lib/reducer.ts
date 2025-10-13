import { Reducer } from '@embedpdf/core';
import { DocumentManagerState } from './types';
import {
  DocumentManagerAction,
  SET_DOCUMENT_ORDER,
  ADD_TO_DOCUMENT_ORDER,
  REMOVE_FROM_DOCUMENT_ORDER,
} from './actions';

export const initialState: DocumentManagerState = {
  documentOrder: [],
};

export const documentManagerReducer: Reducer<DocumentManagerState, DocumentManagerAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case SET_DOCUMENT_ORDER:
      return {
        ...state,
        documentOrder: action.payload,
      };

    case ADD_TO_DOCUMENT_ORDER: {
      const { documentId, index } = action.payload;
      const newOrder = [...state.documentOrder];

      // Remove if already exists
      const existingIndex = newOrder.indexOf(documentId);
      if (existingIndex !== -1) {
        newOrder.splice(existingIndex, 1);
      }

      // Add at specified index or end
      if (index !== undefined && index >= 0 && index <= newOrder.length) {
        newOrder.splice(index, 0, documentId);
      } else {
        newOrder.push(documentId);
      }

      return {
        ...state,
        documentOrder: newOrder,
      };
    }

    case REMOVE_FROM_DOCUMENT_ORDER: {
      return {
        ...state,
        documentOrder: state.documentOrder.filter((id) => id !== action.payload),
      };
    }

    default:
      return state;
  }
};
