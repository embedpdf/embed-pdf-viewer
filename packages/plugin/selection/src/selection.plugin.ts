import { definePlugin } from '@embedpdf/core';
import { FeedbackToken, InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { SELECTION_DEFAULTS, type SelectionConfig } from './contract';
import { createSelectionController } from './controller';
import { SelectionToken } from './host-contract';
import { initialSelectionState } from './model';

/**
 * Text selection: document-scoped, requires the interaction hub, whose
 * pointer stream drives the selection's own handler. Works with `<Stage>`
 * or a standalone `<PageView>`: selection only needs the page coordinate
 * context and the engine's text geometry. Platform feedback (haptics) is
 * optional. `config` is the settings the app registers, over
 * {@link SELECTION_DEFAULTS}.
 */
export const selectionPlugin = (config?: SelectionConfig) =>
  definePlugin({
    id: 'selection',
    token: SelectionToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [FeedbackToken],
    state: initialSelectionState,
    settings: { defaults: SELECTION_DEFAULTS, registered: config },
    create: createSelectionController,
  });
