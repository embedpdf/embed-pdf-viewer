import type { CommandsAction, CommandsState } from './types';

export const initialCommandsState: CommandsState = {
  disabledCategories: [],
};

export function commandsReducer(state: CommandsState, action: CommandsAction): CommandsState {
  switch (action.type) {
    case 'COMMANDS/DISABLE_CATEGORY':
      return state.disabledCategories.includes(action.category)
        ? state
        : { disabledCategories: [...state.disabledCategories, action.category] };
    case 'COMMANDS/ENABLE_CATEGORY':
      return state.disabledCategories.includes(action.category)
        ? { disabledCategories: state.disabledCategories.filter((c) => c !== action.category) }
        : state;
    case 'COMMANDS/SET_DISABLED_CATEGORIES':
      return { disabledCategories: [...action.categories] };
    default:
      return state;
  }
}
