import { definePlugin } from '@embedpdf/core';
import { FeedbackToken, InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import type { SelectionConfig } from './contract';
import { createSelectionController } from './controller';
import { createTextSelectHandler } from './handler';
import { SelectionToken, type SelectionHostCapability } from './host-contract';
import { initialSelectionState, reduceSelection } from './model';
import type { SelectionAction, SelectionState } from './model';

/**
 * Text selection — document-scoped, requires the interaction hub. Once every
 * capability exists it registers ITS pointer handler with the hub; the hub
 * owns the pointer stream and arbitration. Works with `<Stage>` or a
 * standalone `<PageView>` — selection only needs the page coordinate
 * context + the engine's text geometry.
 */
export const selectionPlugin = (config: SelectionConfig = {}) =>
  definePlugin<SelectionState, SelectionAction, SelectionHostCapability>({
    id: 'selection',
    token: SelectionToken,
    scope: 'document',
    requires: [InteractionToken],
    // Platform feedback (haptics) is OPTIONAL: absent in headless setups, the
    // handler simply never buzzes.
    optional: [FeedbackToken],
    initialState: initialSelectionState,
    reduce: reduceSelection,
    create: (ctx) => {
      const { api, connect } = createSelectionController(ctx);
      return {
        api,
        connect() {
          connect();
          const interaction = ctx.get(InteractionToken);
          interaction.registerHandler(
            createTextSelectHandler(api, interaction, ctx.tryGet(FeedbackToken) ?? undefined, {
              dragThreshold: config.dragThreshold,
            }),
          );
        },
      };
    },
  });
