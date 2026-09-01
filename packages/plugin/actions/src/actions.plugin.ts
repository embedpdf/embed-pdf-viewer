import { definePlugin } from '@embedpdf/core';

import { createActionsCapability } from './capability';
import { actionsReducer, initialActionsState } from './reducer';
import { ActionsToken } from './types';
import type { ActionsAction, ActionsCapability, ActionsPluginConfig, ActionsState } from './types';

/**
 * The action engine: the DEPENDENCY ROOT of the action architecture. It
 * interprets extracted /A and /AA trees; it never detects triggers and never
 * imports another plugin's token — stage, annotation, link, and form
 * optionally depend on ActionsToken and register their executors and sinks
 * at init (the kernel's topological order guarantees this plugin initializes
 * first). JavaScript is one registered interpreter among many: Hide,
 * ResetForm, GoTo, and Named work with scripting off.
 */
export const actionsPlugin = (config?: ActionsPluginConfig) =>
  definePlugin<ActionsState, ActionsAction, ActionsCapability>({
    id: 'actions',
    token: ActionsToken,
    scope: 'document',
    initialState: initialActionsState,
    reduce: actionsReducer,
    capability: (ctx) => createActionsCapability(ctx, config),
  });
