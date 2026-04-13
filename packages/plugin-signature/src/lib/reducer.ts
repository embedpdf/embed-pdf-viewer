import { Reducer } from '@embedpdf/core';
import { SignatureAction, ADD_SIGNATURE_ENTRY, REMOVE_SIGNATURE_ENTRY } from './actions';
import { SignatureState } from './types';

export const initialState: SignatureState = {
  entryIds: [],
};

export const signatureReducer: Reducer<SignatureState, SignatureAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case ADD_SIGNATURE_ENTRY:
      return {
        ...state,
        entryIds: [...state.entryIds, action.payload],
      };

    case REMOVE_SIGNATURE_ENTRY:
      return {
        ...state,
        entryIds: state.entryIds.filter((id) => id !== action.payload),
      };

    default:
      return state;
  }
};
