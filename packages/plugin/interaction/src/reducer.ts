import type { InteractionAction, InteractionConfig, InteractionState } from './types';

export const initialInteractionState = (config: InteractionConfig): InteractionState => ({
  activeToolId: config.defaultTool ?? 'pointer',
  cursor: 'default',
});

export const interactionReducer = (
  state: InteractionState,
  action: InteractionAction,
): InteractionState => {
  switch (action.type) {
    case 'SET_TOOL':
      return state.activeToolId === action.toolId
        ? state
        : { ...state, activeToolId: action.toolId };
    case 'SET_CURSOR':
      return state.cursor === action.cursor ? state : { ...state, cursor: action.cursor };
    default:
      return state;
  }
};
