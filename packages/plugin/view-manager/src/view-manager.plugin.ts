import { definePlugin, DocumentsToken } from '@embedpdf/core';

import { createViewManagerController } from './controller';
import { ViewManagerToken } from './host-contract';
import type { ViewManagerHostCapability } from './host-contract';
import { initialViewManagerState, viewManagerReducer } from './model';
import type { ViewManagerAction, ViewManagerState } from './model';

/**
 * The view-manager plugin: workspace-scoped (one instance that sees every
 * document) because panes are a workspace concern, not a per-document one.
 */
export const viewManagerPlugin = () =>
  definePlugin<ViewManagerState, ViewManagerAction, ViewManagerHostCapability>({
    id: 'view-manager',
    scope: 'workspace',
    token: ViewManagerToken,
    requires: [DocumentsToken],
    initialState: initialViewManagerState,
    reduce: viewManagerReducer,
    create: (ctx) => createViewManagerController(ctx),
  });
