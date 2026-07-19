import { initialModel } from './core/model';
import type { FormAction, FormState } from './types';

export const initialFormState = (): FormState => ({ model: initialModel() });

/** Dumb store: the pure core computes the next model; the shell dispatches it. */
export const formReducer = (state: FormState, action: FormAction): FormState =>
  action.type === 'SET_MODEL' ? { model: action.model } : state;
