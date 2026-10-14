import { definePlugin } from '@embedpdf/core';

import { PageEditToken } from './contract';
import { createPageEditController } from './controller';

/**
 * Document-scoped and stateless: the engine handle's page service as page
 * edits that take refs or indexes. Turning a page relative to its own
 * rotation lives in the controller, so no app re-derives it.
 */
export const pageEditPlugin = () =>
  definePlugin({
    id: 'page-edit',
    scope: 'document',
    token: PageEditToken,
    create: createPageEditController,
  });
