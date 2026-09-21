import { initialModel } from './core/model';
import type { FormAction, FormState } from './types';

export const initialFormState = (): FormState => ({ model: initialModel(), status: 'idle' });

/** Dumb store: the pure core computes the next model; the shell dispatches it. */
export const formReducer = (state: FormState, action: FormAction): FormState => {
  switch (action.type) {
    case 'SET_MODEL':
      return { ...state, model: action.model };
    case 'SET_STATUS':
      return state.status === action.status ? state : { ...state, status: action.status };
    default:
      return state;
  }
};
