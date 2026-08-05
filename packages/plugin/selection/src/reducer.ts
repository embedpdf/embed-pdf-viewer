import type { SelectionAction, SelectionState } from './types';

export const initialSelectionState: SelectionState = {
  selection: null,
  rects: {},
  loaded: {},
  highlightHidden: false,
};

export const selectionReducer = (
  state: SelectionState,
  action: SelectionAction,
): SelectionState => {
  switch (action.type) {
    case 'PAGE_LOADED':
      return state.loaded[action.pon]
        ? state
        : { ...state, loaded: { ...state.loaded, [action.pon]: true } };
    case 'SET':
      return { ...state, selection: action.selection, rects: action.rects };
    case 'CLEAR':
      return state.selection === null && Object.keys(state.rects).length === 0
        ? state
        : { ...state, selection: null, rects: {} };
    case 'SET_HIGHLIGHT_HIDDEN':
      return state.highlightHidden === action.hidden
        ? state
        : { ...state, highlightHidden: action.hidden };
    default:
      return state;
  }
};
