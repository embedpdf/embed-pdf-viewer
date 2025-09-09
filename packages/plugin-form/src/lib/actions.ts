import { Action } from '@embedpdf/core';
import { FormState } from './types';

export const SET_FORM_STATE = 'FORM/SET_FORM_STATE';

export interface SetFormStateAction extends Action {
  type: typeof SET_FORM_STATE;
  payload: FormState;
}

export type FormAction = SetFormStateAction;

export const setFormState = (state: FormState): SetFormStateAction => ({
  type: SET_FORM_STATE,
  payload: state,
});
