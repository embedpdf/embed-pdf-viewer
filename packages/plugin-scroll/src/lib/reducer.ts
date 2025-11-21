import { Reducer, CoreState } from '@embedpdf/core';
import { ScrollState, ScrollStrategy, ScrollPluginConfig, PageChangeState } from './types';
import {
  ScrollAction,
  INIT_SCROLL_STATE,
  CLEANUP_SCROLL_STATE,
  UPDATE_DOCUMENT_SCROLL_STATE,
  SET_SCROLL_STRATEGY,
} from './actions';

export const defaultPageChangeState: PageChangeState = {
  isChanging: false,
  targetPage: 1,
  fromPage: 1,
  startTime: 0,
};

export const initialState: (coreState: CoreState, config: ScrollPluginConfig) => ScrollState = (
  _coreState,
  config,
) => ({
  defaultStrategy: config.defaultStrategy ?? ScrollStrategy.Vertical,
  defaultPageGap: config.defaultPageGap ?? 10,
  defaultBufferSize: config.defaultBufferSize ?? 2,
  documents: {},
});

export const scrollReducer: Reducer<ScrollState, ScrollAction> = (state, action) => {
  switch (action.type) {
    case INIT_SCROLL_STATE: {
      const { documentId, state: docState } = action.payload;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: docState,
        },
      };
    }

    case CLEANUP_SCROLL_STATE: {
      const { [action.payload]: removed, ...remaining } = state.documents;
      return {
        ...state,
        documents: remaining,
      };
    }

    case UPDATE_DOCUMENT_SCROLL_STATE: {
      const { documentId, state: updates } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            ...updates,
          },
        },
      };
    }

    case SET_SCROLL_STRATEGY: {
      const { documentId, strategy } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            strategy,
          },
        },
      };
    }

    default:
      return state;
  }
};
