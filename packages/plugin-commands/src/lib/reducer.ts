import { Reducer } from '@embedpdf/core';
import { CommandsState } from './types';
import { CommandsAction, MARK_COMMANDS_CHANGED, CLEAR_CHANGED_COMMANDS } from './actions';

export const initialState: CommandsState = {
  changedCommands: new Set(),
};

export const commandsReducer: Reducer<CommandsState, CommandsAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case MARK_COMMANDS_CHANGED: {
      const newSet = new Set(state.changedCommands);
      action.payload.forEach((id) => newSet.add(id));
      return {
        ...state,
        changedCommands: newSet,
      };
    }

    case CLEAR_CHANGED_COMMANDS: {
      return {
        ...state,
        changedCommands: new Set(),
      };
    }

    default:
      return state;
  }
};
