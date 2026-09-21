import { definePlugin } from '@embedpdf/core';

import type { ActionsConfig } from './contract';
import { createActionsController } from './controller';
import { ActionsToken } from './host-contract';
import type { ActionsHostCapability } from './host-contract';
import { actionsReducer, initialActionsState } from './model';
import type { ActionsAction, ActionsState } from './model';

/**
 * The action engine: the DEPENDENCY ROOT of the action architecture. It
 * interprets extracted /A and /AA trees; it never detects triggers and never
 * imports another plugin's token — stage, annotation, link, and form
 * optionally depend on ActionsToken and register their executors and sinks
 * at connect time (the kernel's topological order guarantees this plugin
 * initializes first). JavaScript is one registered interpreter among many:
 * Hide, ResetForm, GoTo, and Named work with scripting off.
 */
export const actionsPlugin = (config?: ActionsConfig) =>
  definePlugin<ActionsState, ActionsAction, ActionsHostCapability>({
    id: 'actions',
    token: ActionsToken,
    scope: 'document',
    initialState: initialActionsState,
    reduce: actionsReducer,
    create: (ctx) => ({ api: createActionsController(ctx, config) }),
  });
