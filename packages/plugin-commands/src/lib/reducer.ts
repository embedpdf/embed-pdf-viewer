import { Reducer } from '@embedpdf/core';
import { CommandsState } from './types';
import { CommandsAction, SET_DISABLED_CATEGORIES } from './actions';

export const initialState: CommandsState = {
  disabledCategories: [],
};

export const commandsReducer: Reducer<CommandsState, CommandsAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case SET_DISABLED_CATEGORIES:
      return {
        ...state,
        disabledCategories: action.payload,
      };

    default:
      return state;
  }
};
