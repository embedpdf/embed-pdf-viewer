/** The selection plugin's wiring to its siblings, run from the controller's `connect`. */
import type { PluginContext } from '@embedpdf/core';
import { FeedbackToken, InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import type { SelectionConfig } from './contract';
import { createTextSelectHandler } from './handler';
import type { SelectionHostCapability } from './host-contract';
import type { SelectionState } from './model';

/**
 * Register the text-select pointer handler with the interaction hub, which
 * owns the pointer stream and arbitration. Platform feedback (haptics) is
 * optional: without it (headless setups) the handler never buzzes.
 */
export function connectSelection(
  ctx: PluginContext<SelectionState>,
  selection: SelectionHostCapability,
  config: SelectionConfig,
): void {
  const interaction = ctx.get(InteractionToken);
  const feedback = ctx.tryGet(FeedbackToken) ?? undefined;
  ctx.cleanup(
    interaction.registerHandler(
      createTextSelectHandler(selection, interaction, feedback, {
        dragThreshold: config.dragThreshold,
      }),
    ),
  );
}
