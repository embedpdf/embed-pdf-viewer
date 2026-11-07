/**
 * The tools page's State table as code: what `useInteractionState()` returns,
 * and the same fields in every other framework. With no document there is no
 * active tool and no tool to switch to.
 */
import { defineState } from '@embedpdf/core';

import { InteractionToken, type Tool, type ToolId } from './contract';

/** The active tool and every tool. */
export interface InteractionState {
  /** The active tool's id; `null` with no document. */
  readonly activeToolId: ToolId | null;
  /** Every tool, in the order they were added, the built-in ones first. */
  readonly tools: readonly Tool[];
}

export const interactionState = defineState(InteractionToken, {
  read: (interaction): InteractionState => ({
    activeToolId: interaction.getActiveToolId(),
    tools: interaction.listTools(),
  }),
  empty: { activeToolId: null, tools: [] },
});
