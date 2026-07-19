import { definePlugin } from '@embedpdf/core';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import { createSelectionCapability } from './capability';
import { createTextSelectHandler } from './handler';
import { initialSelectionState, selectionReducer } from './reducer';
import { SelectionToken } from './types';
import type { SelectionAction, SelectionCapability, SelectionState } from './types';

/**
 * Text selection — document-scoped, requires the interaction hub. In `init` it
 * registers ITS pointer handler with the hub; the hub owns the pointer stream
 * and arbitration. Works with `<Stage>` or a standalone `<PageView>` — selection
 * only needs the page coordinate context + the engine's text geometry.
 */
export const selectionPlugin = () =>
  definePlugin<SelectionState, SelectionAction, SelectionCapability>({
    id: 'selection',
    token: SelectionToken,
    scope: 'document',
    requires: [InteractionToken],
    initialState: initialSelectionState,
    reduce: selectionReducer,
    capability: createSelectionCapability,
    init: (ctx) => {
      const interaction = ctx.get(InteractionToken);
      const selection = ctx.get(SelectionToken); // our own capability (built before init)
      interaction.registerHandler(createTextSelectHandler(selection, interaction));
    },
  });
