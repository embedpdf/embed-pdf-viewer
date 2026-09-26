import { definePlugin } from '@embedpdf/core';

import type { ActionsConfig } from './contract';
import { createActionsController } from './controller';
import { ActionsToken, type ActionsHostCapability } from './host-contract';

/**
 * The action engine, the dependency root of the action architecture. It
 * interprets extracted /A and /AA trees; it never detects triggers and never
 * imports another plugin's token: the stage, annotation, link and form
 * plugins optionally depend on it and register their executors and sinks
 * when they connect (the kernel's dependency order creates this plugin
 * first). JavaScript is one registered interpreter among many: Hide,
 * ResetForm, GoTo and Named work with scripting off. Document-scoped and
 * stateless.
 */
export const actionsPlugin = (config?: ActionsConfig) =>
  definePlugin<void, ActionsHostCapability>({
    id: 'actions',
    token: ActionsToken,
    scope: 'document',
    create: (ctx) => createActionsController(ctx, config),
  });
