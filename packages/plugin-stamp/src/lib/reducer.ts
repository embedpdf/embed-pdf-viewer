import { Reducer } from '@embedpdf/core';
import { StampAction, ADD_STAMP_LIBRARY, REMOVE_STAMP_LIBRARY } from './actions';
import { StampState } from './types';

export const initialState: StampState = {
  libraryIds: [],
};

export const stampReducer: Reducer<StampState, StampAction> = (state = initialState, action) => {
  switch (action.type) {
    case ADD_STAMP_LIBRARY:
      return {
        ...state,
        libraryIds: [...state.libraryIds, action.payload],
      };

    case REMOVE_STAMP_LIBRARY:
      return {
        ...state,
        libraryIds: state.libraryIds.filter((id) => id !== action.payload),
      };

    default:
      return state;
  }
};
