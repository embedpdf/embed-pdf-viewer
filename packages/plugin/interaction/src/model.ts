import type { Cursor, InteractionConfig, ToolId } from './contract';

export interface InteractionState {
  readonly activeToolId: ToolId;
  readonly defaultToolId: ToolId;
  /** Tools armed with `pushTool`, oldest first; `popTool` restores the last. */
  readonly toolStack: readonly ToolId[];
  readonly cursor: Cursor;
}

export type InteractionAction =
  | { type: 'SET_TOOL'; toolId: ToolId }
  | { type: 'PUSH_TOOL'; toolId: ToolId }
  | { type: 'POP_TOOL' }
  | { type: 'SET_CURSOR'; cursor: Cursor };

export const initialInteractionState = (config: InteractionConfig): InteractionState => ({
  activeToolId: config.defaultTool ?? 'pointer',
  defaultToolId: config.defaultTool ?? 'pointer',
  toolStack: [],
  cursor: 'default',
});

export function reduceInteraction(
  state: InteractionState,
  action: InteractionAction,
): InteractionState {
  switch (action.type) {
    case 'SET_TOOL':
      return state.activeToolId === action.toolId && state.toolStack.length === 0
        ? state
        : { ...state, activeToolId: action.toolId, toolStack: [] };
    case 'PUSH_TOOL':
      return {
        ...state,
        toolStack: [...state.toolStack, state.activeToolId],
        activeToolId: action.toolId,
      };
    case 'POP_TOOL': {
      if (state.toolStack.length === 0) return state;
      const toolStack = state.toolStack.slice(0, -1);
      return { ...state, toolStack, activeToolId: state.toolStack[state.toolStack.length - 1] };
    }
    case 'SET_CURSOR':
      return state.cursor === action.cursor ? state : { ...state, cursor: action.cursor };
    default:
      return state;
  }
}
