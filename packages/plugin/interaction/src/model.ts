/**
 * The interaction state: the active tool, the stack `pushTool` saves, and the
 * resolved cursor, so UI can react. Tools, handlers and cursor claims are
 * registries in the controller's closure. Every function below is a pure
 * transition; the controller applies them with `ctx.state.update`.
 */
import type { Cursor, ToolId } from './contract';
import type { HostTool } from './host-contract';

export interface InteractionModel {
  readonly activeToolId: ToolId;
  /** Tools activated with `pushTool`, oldest first; `popTool` restores the last. */
  readonly toolStack: readonly ToolId[];
  readonly cursor: Cursor;
}

/** A document starts on `pointer`; the controller then activates the `defaultTool` setting. */
export const initialInteractionModel = (): InteractionModel => ({
  activeToolId: 'pointer',
  toolStack: [],
  cursor: 'default',
});

/** Activate a tool and forget every pushed one. */
export function activateTool(state: InteractionModel, toolId: ToolId): InteractionModel {
  if (state.activeToolId === toolId && state.toolStack.length === 0) return state;
  return { ...state, activeToolId: toolId, toolStack: [] };
}

/** Activate a tool for a moment, saving the active one for {@link popTool}. */
export function pushTool(state: InteractionModel, toolId: ToolId): InteractionModel {
  return { ...state, toolStack: [...state.toolStack, state.activeToolId], activeToolId: toolId };
}

/** Activate the tool saved last; an empty stack changes nothing. */
export function popTool(state: InteractionModel): InteractionModel {
  if (state.toolStack.length === 0) return state;
  return {
    ...state,
    toolStack: state.toolStack.slice(0, -1),
    activeToolId: state.toolStack[state.toolStack.length - 1],
  };
}

export function setCursor(state: InteractionModel, cursor: Cursor): InteractionModel {
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
export const builtinTools = (): HostTool[] => [
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
