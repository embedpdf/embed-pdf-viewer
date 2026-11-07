import { definePlugin, DocumentsToken } from '@embedpdf/core';

import { ViewManagerToken } from './contract';
import { createViewManagerController } from './controller';
import { initialViewManagerModel } from './model';

/**
 * The view-manager plugin: which documents each pane shows. Workspace-scoped,
 * because panes span documents.
 */
export const viewManagerPlugin = () =>
  definePlugin({
    id: 'view-manager',
    scope: 'workspace',
    token: ViewManagerToken,
    requires: [DocumentsToken],
    state: initialViewManagerModel,
    create: createViewManagerController,
  });
