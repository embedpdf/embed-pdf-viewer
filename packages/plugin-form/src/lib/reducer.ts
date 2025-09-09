import { Reducer } from '@embedpdf/core';
import { FormState } from './types';
import { FormAction, SET_FORM_STATE } from './actions';

export const initialState: FormState = {};

export const reducer: Reducer<FormState, FormAction> = (state, action) => {
  switch (action.type) {
    case SET_FORM_STATE:
      return { ...state, ...action.payload };
    default:
      return state;
  }
};
