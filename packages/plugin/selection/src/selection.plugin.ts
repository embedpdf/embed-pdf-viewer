import { definePlugin } from '@embedpdf/core';
import { FeedbackToken, InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import type { SelectionConfig } from './contract';
import { createSelectionController } from './controller';
import { SelectionToken, type SelectionHostCapability } from './host-contract';
import { initialSelectionState, type SelectionState } from './model';

/**
 * Text selection: document-scoped, requires the interaction hub, whose
 * pointer stream drives the selection's own handler. Works with `<Stage>`
 * or a standalone `<PageView>`: selection only needs the page coordinate
 * context and the engine's text geometry. Platform feedback (haptics) is
 * optional.
 */
export const selectionPlugin = (config: SelectionConfig = {}) =>
  definePlugin<SelectionState, SelectionHostCapability>({
    id: 'selection',
    token: SelectionToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [FeedbackToken],
    state: initialSelectionState,
    create: (ctx) => createSelectionController(ctx, config),
  });
