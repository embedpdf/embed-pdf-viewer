import { definePlugin, DocumentsToken } from '@embedpdf/core';
import { createViewManagerCapability } from './capability';
import { registerViewManagerEffects } from './effects';
import { initialViewManagerState, viewManagerReducer } from './reducer';
import { ViewManagerToken } from './types';
import type { ViewManagerAction, ViewManagerCapability, ViewManagerState } from './types';

/**
 * The view-manager plugin: workspace-scoped (one instance that sees every
 * document) because panes are a workspace concern, not a per-document one.
 */
export const viewManagerPlugin = () =>
  definePlugin<ViewManagerState, ViewManagerAction, ViewManagerCapability>({
    id: 'view-manager',
    scope: 'workspace',
    token: ViewManagerToken,
    requires: [DocumentsToken],
    initialState: initialViewManagerState,
    reduce: viewManagerReducer,
    capability: createViewManagerCapability,
    effects: registerViewManagerEffects,
  });
