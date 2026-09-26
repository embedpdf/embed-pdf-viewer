/**
 * The interaction state: the armed tool, the stack `pushTool` saves, and the
 * resolved cursor, so UI can react. Tools, handlers and cursor claims are
 * registries in the controller's closure. Every function below is a pure
 * transition; the controller applies them with `ctx.state.update`.
 */
import type { Cursor, InteractionConfig, Tool, ToolId } from './contract';

export interface InteractionState {
  readonly activeToolId: ToolId;
  readonly defaultToolId: ToolId;
  /** Tools armed with `pushTool`, oldest first; `popTool` restores the last. */
  readonly toolStack: readonly ToolId[];
  readonly cursor: Cursor;
}

export const initialInteractionState = (config: InteractionConfig): InteractionState => ({
  activeToolId: config.defaultTool ?? 'pointer',
  defaultToolId: config.defaultTool ?? 'pointer',
  toolStack: [],
  cursor: 'default',
});

/** Arm a tool and forget every pushed one. */
export function activateTool(state: InteractionState, toolId: ToolId): InteractionState {
  if (state.activeToolId === toolId && state.toolStack.length === 0) return state;
  return { ...state, activeToolId: toolId, toolStack: [] };
}

/** Arm a tool temporarily, saving the armed one for {@link popTool}. */
export function pushTool(state: InteractionState, toolId: ToolId): InteractionState {
  return { ...state, toolStack: [...state.toolStack, state.activeToolId], activeToolId: toolId };
}

/** Re-arm the tool saved last; an empty stack changes nothing. */
export function popTool(state: InteractionState): InteractionState {
  if (state.toolStack.length === 0) return state;
  return {
    ...state,
    toolStack: state.toolStack.slice(0, -1),
    activeToolId: state.toolStack[state.toolStack.length - 1],
  };
}

export function setCursor(state: InteractionState, cursor: Cursor): InteractionState {
  return state.cursor === cursor ? state : { ...state, cursor };
}

/**
 * The two built-in tools. Features add tools via `registerTool`. `enables`
 * is the composition seam:
 *   pointer → text selection + annotation editing + marquee selection
 *   pan     → scrolling (contributed by Stage) + annotation editing, no text select
 * Both carry `form-fill` and `link-nav`: filling forms and following links is
 * the resting state of a viewer (Acrobat's hand tool does both).
 */
export const builtinTools = (): Tool[] => [
  {
    id: 'pointer',
    cursor: 'default',
    enables: new Set([
      'text-select',
      'annotation-edit',
      'annotation-marquee',
      'form-fill',
      'link-nav',
    ]),
  },
  {
    id: 'pan',
    cursor: 'grab',
    gapCursor: 'grab',
    enables: new Set(['scroll', 'annotation-edit', 'form-fill', 'link-nav']),
  },
];
