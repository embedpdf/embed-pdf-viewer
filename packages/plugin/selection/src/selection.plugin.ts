import { definePlugin } from '@embedpdf/core';
import { FeedbackToken, InteractionToken } from '@embedpdf/plugin-interaction';
import { createSelectionCapability } from './capability';
import { createTextSelectHandler } from './handler';
import { initialSelectionState, selectionReducer } from './reducer';
import { SelectionToken } from './types';
import type { SelectionAction, SelectionHostCapability, SelectionState } from './types';

/**
 * Text selection — document-scoped, requires the interaction hub. In `init` it
 * registers ITS pointer handler with the hub; the hub owns the pointer stream
 * and arbitration. Works with `<Stage>` or a standalone `<PageView>` — selection
 * only needs the page coordinate context + the engine's text geometry.
 *
 * Registry/content invalidation is wired inside the capability itself
 * (revision watch + document event subscription), so headless/programmatic
 * use gets the same reconciliation as the full viewer.
 */
export const selectionPlugin = () =>
  definePlugin<SelectionState, SelectionAction, SelectionHostCapability>({
    id: 'selection',
    token: SelectionToken,
    scope: 'document',
    requires: [InteractionToken],
    // Platform feedback (haptics) is OPTIONAL: absent in headless setups, the
    // handler simply never buzzes.
    optional: [FeedbackToken],
    initialState: initialSelectionState,
    reduce: selectionReducer,
    capability: createSelectionCapability,
    init: (ctx) => {
      const interaction = ctx.get(InteractionToken);
      const selection = ctx.get(SelectionToken); // our own capability (built before init)
      const feedback = ctx.tryGet(FeedbackToken);
      interaction.registerHandler(
        createTextSelectHandler(selection, interaction, feedback ?? undefined),
      );
    },
  });
