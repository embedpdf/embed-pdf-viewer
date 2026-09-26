/**
 * The commands state: only the serializable category gates. Definitions hold
 * functions, so they live in the controller's registry. Every function below
 * is a pure transition; the controller applies them with `ctx.state.update`.
 */
export interface CommandsState {
  readonly disabledCategories: readonly string[];
}

export const initialCommandsState = (disabled: readonly string[] = []): CommandsState => ({
  disabledCategories: [...disabled],
});

export function disableCategory(state: CommandsState, category: string): CommandsState {
  if (state.disabledCategories.includes(category)) return state;
  return { disabledCategories: [...state.disabledCategories, category] };
}

export function enableCategory(state: CommandsState, category: string): CommandsState {
  if (!state.disabledCategories.includes(category)) return state;
  return { disabledCategories: state.disabledCategories.filter((other) => other !== category) };
}

export function setDisabledCategories(
  state: CommandsState,
  categories: readonly string[],
): CommandsState {
  const unchanged =
    categories.length === state.disabledCategories.length &&
    categories.every((category, index) => category === state.disabledCategories[index]);
  return unchanged ? state : { disabledCategories: [...categories] };
}
