/**
 * @embedpdf/plugin-interaction — the pointer/tool/cursor hub.
 *
 * The shared mechanism every interactive feature rides on: one active tool, one
 * cursor, one priority-ordered handler list. Standard layout: types.ts ·
 * reducer.ts · capability.ts · interaction.plugin.ts. Zero framework code.
 */
export { interactionPlugin, builtinTools } from './interaction.plugin';
export { createInteractionCapability } from './capability';
export { initialInteractionState, interactionReducer } from './reducer';
export { InteractionToken, samplePointOn } from './types';
export type {
  Cursor,
  InteractionAction,
  InteractionCapability,
  InteractionConfig,
  InteractionHandler,
  InteractionState,
  Modifiers,
  Phase,
  PointerKind,
  PointerSample,
  Tool,
  ToolId,
} from './types';
