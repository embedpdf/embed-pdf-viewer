import type { RedactionAction, RedactionState } from './types';

export const initialRedactionState = (): RedactionState => ({
  applying: false,
  lastResult: null,
});

export const redactionReducer = (
  state: RedactionState,
  action: RedactionAction,
): RedactionState => {
  switch (action.type) {
    case 'APPLY_STARTED':
      return { ...state, applying: true };
    case 'APPLY_FINISHED':
      return { applying: false, lastResult: action.result ?? state.lastResult };
    default:
      return state;
  }
};
