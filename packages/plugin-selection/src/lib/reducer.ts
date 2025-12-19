import { SelectionDocumentState, SelectionState } from './types';
import {
  SelectionAction,
  CACHE_PAGE_GEOMETRY,
  SET_SELECTION,
  START_SELECTION,
  END_SELECTION,
  CLEAR_SELECTION,
  RESET,
  SET_SLICES,
  SET_RECTS,
  INIT_SELECTION_STATE,
  CLEANUP_SELECTION_STATE,
} from './actions';

export const initialSelectionDocumentState: SelectionDocumentState = {
  geometry: {},
  rects: {},
  slices: {},
  selection: null,
  active: false,
  selecting: false,
};

export const initialState: SelectionState = {
  documents: {},
};

const updateDocState = (
  state: SelectionState,
  documentId: string,
  newDocState: SelectionDocumentState,
): SelectionState => ({
  ...state,
  documents: {
    ...state.documents,
    [documentId]: newDocState,
  },
});

export const selectionReducer = (state = initialState, action: SelectionAction): SelectionState => {
  switch (action.type) {
    case INIT_SELECTION_STATE: {
      const { documentId, state: docState } = action.payload;
      return updateDocState(state, documentId, docState);
    }

    case CLEANUP_SELECTION_STATE: {
      const documentId = action.payload;
      const { [documentId]: removed, ...remaining } = state.documents;
      return {
        ...state,
        documents: remaining,
      };
    }

    case CACHE_PAGE_GEOMETRY: {
      const { documentId, page, geo } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return updateDocState(state, documentId, {
        ...docState,
        geometry: { ...docState.geometry, [page]: geo },
      });
    }

    case SET_SELECTION: {
      const { documentId, selection } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return updateDocState(state, documentId, {
        ...docState,
        selection,
        active: true,
      });
    }

    case START_SELECTION: {
      const { documentId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return updateDocState(state, documentId, {
        ...docState,
        selecting: true,
        selection: null,
        rects: {},
      });
    }

    case END_SELECTION: {
      const { documentId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return updateDocState(state, documentId, { ...docState, selecting: false });
    }

    case CLEAR_SELECTION: {
      const { documentId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return updateDocState(state, documentId, {
        ...docState,
        selecting: false,
        selection: null,
        rects: {},
        active: false,
      });
    }

    case SET_RECTS: {
      const { documentId, rects } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return updateDocState(state, documentId, { ...docState, rects });
    }

    case SET_SLICES: {
      const { documentId, slices } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return updateDocState(state, documentId, { ...docState, slices });
    }

    case RESET: {
      const { documentId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return updateDocState(state, documentId, initialSelectionDocumentState);
    }

    default:
      return state;
  }
};
