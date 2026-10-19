import { definePlugin } from '@embedpdf/core';

import { INTERACTION_DEFAULTS, type InteractionConfig } from './contract';
import { createInteractionController } from './controller';
import { InteractionToken } from './host-contract';
import { builtinTools, initialInteractionState } from './model';

/**
 * The interaction hub: document-scoped, depends on nothing. Feature plugins
 * `require` this token; the Stage `optional`-ly contributes a scroll handler.
 * `config` is the settings the app registers, over {@link INTERACTION_DEFAULTS}.
 */
export const interactionPlugin = (config?: InteractionConfig) =>
  definePlugin({
    id: 'interaction',
    token: InteractionToken,
    scope: 'document',
    state: initialInteractionState,
    settings: { defaults: INTERACTION_DEFAULTS, registered: config },
    create: (ctx) => createInteractionController(ctx, builtinTools()),
  });
