import { definePlugin } from '@embedpdf/core';

import { PageEditToken } from './contract';
import { createPageEditController } from './controller';
import { initialPageEditModel } from './model';

/**
 * Document-scoped: the document's page edits, each one change of its
 * history, and which of its pages are selected. Turning a page relative to
 * its own rotation lives in the controller, so no app re-derives it.
 */
export const pageEditPlugin = () =>
  definePlugin({
    id: 'page-edit',
    scope: 'document',
    token: PageEditToken,
    state: initialPageEditModel,
    create: createPageEditController,
  });
