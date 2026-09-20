import type { SelectionAction, SelectionState } from './types';

export const initialSelectionState: SelectionState = {
  selection: null,
  segments: {},
  loaded: {},
  highlightHidden: false,
  selecting: false,
};

export const selectionReducer = (
  state: SelectionState,
  action: SelectionAction,
): SelectionState => {
  switch (action.type) {
    case 'PAGE_LOADED': {
      const pon = action.page.pageObjectNumber;
      return state.loaded[pon] ? state : { ...state, loaded: { ...state.loaded, [pon]: true } };
    }
    case 'SET':
      return { ...state, selection: action.selection, segments: action.segments };
    case 'CLEAR':
      return state.selection === null && Object.keys(state.segments).length === 0
        ? state
        : { ...state, selection: null, segments: {} };
    case 'SET_HIGHLIGHT_HIDDEN':
      return state.highlightHidden === action.hidden
        ? state
        : { ...state, highlightHidden: action.hidden };
    case 'SET_SELECTING':
      return state.selecting === action.selecting
        ? state
        : { ...state, selecting: action.selecting };
    default:
      return state;
  }
};
