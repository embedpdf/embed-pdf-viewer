/**
 * The tools page's State table as code: what `useInteractionState()` returns,
 * and the same fields in every other framework. With no document there is no
 * active tool and no tool to switch to.
 */
import { defineState } from '@embedpdf/core';

import { InteractionToken, type ToolId } from './contract';

export const interactionState = defineState(InteractionToken, {
  read: (interaction) => ({
    // Widened: the empty state has no active tool.
    activeToolId: interaction.getActiveToolId() as ToolId | null,
    tools: interaction.listTools(),
  }),
  empty: { activeToolId: null, tools: [] },
});
