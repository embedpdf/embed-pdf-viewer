import { definePlugin } from '@embedpdf/core';

import { createPageEditController } from './controller';
import { PageEditToken } from './host-contract';

/**
 * Document-scoped, stateless: turns the engine handle's page service into a
 * ref-addressed edit capability. The relative→absolute rotation lives in the
 * controller so the framework adapters never re-derive it.
 */
export const pageEditPlugin = () =>
  definePlugin({
    id: 'page-edit',
    scope: 'document',
    token: PageEditToken,
    create: (ctx) => ({ api: createPageEditController(ctx) }),
  });
