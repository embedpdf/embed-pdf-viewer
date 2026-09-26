import { definePlugin, DocumentsToken } from '@embedpdf/core';

import { ViewManagerToken, type ViewManagerCapability } from './contract';
import { createViewManagerController } from './controller';
import { initialViewManagerState, type ViewManagerState } from './model';

/**
 * The view-manager plugin: which documents each pane shows. Workspace-scoped,
 * because panes span documents.
 */
export const viewManagerPlugin = () =>
  definePlugin<ViewManagerState, ViewManagerCapability>({
    id: 'view-manager',
    scope: 'workspace',
    token: ViewManagerToken,
    requires: [DocumentsToken],
    state: initialViewManagerState,
    create: createViewManagerController,
  });
