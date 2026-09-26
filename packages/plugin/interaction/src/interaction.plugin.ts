import { definePlugin } from '@embedpdf/core';

import type { InteractionConfig } from './contract';
import { createInteractionController } from './controller';
import { InteractionToken, type InteractionHostCapability } from './host-contract';
import { builtinTools, initialInteractionState, type InteractionState } from './model';

/**
 * The interaction hub — document-scoped, depends on nothing. Feature plugins
 * `require` this token; the Stage `optional`-ly contributes a scroll handler.
 */
export const interactionPlugin = (config: InteractionConfig = {}) =>
  definePlugin<InteractionState, InteractionHostCapability>({
    id: 'interaction',
    token: InteractionToken,
    scope: 'document',
    state: () => initialInteractionState(config),
    create: (ctx) => createInteractionController(ctx, builtinTools(), config.tools ?? []),
  });
