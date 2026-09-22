/** The commands slice: only the serializable category gates. Definitions
 *  hold functions and live in the controller's registry. */
export interface CommandsState {
  readonly disabledCategories: readonly string[];
}

export type CommandsAction =
  | { type: 'COMMANDS/DISABLE_CATEGORY'; category: string }
  | { type: 'COMMANDS/ENABLE_CATEGORY'; category: string }
  | { type: 'COMMANDS/SET_DISABLED_CATEGORIES'; categories: readonly string[] };

export const initialCommandsState = (disabled: readonly string[] = []): CommandsState => ({
  disabledCategories: [...disabled],
});

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
