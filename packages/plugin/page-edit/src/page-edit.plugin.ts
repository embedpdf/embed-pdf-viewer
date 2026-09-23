import { definePlugin } from '@embedpdf/core';

import { PageEditToken, type PageEditCapability } from './contract';
import { createPageEditController } from './controller';

/**
 * Document-scoped, stateless: turns the engine handle's page service into a
 * ref-addressed edit capability. The relative→absolute rotation lives in the
 * controller so the framework adapters never re-derive it.
 */
export const pageEditPlugin = () =>
  definePlugin<void, PageEditCapability>({
    id: 'page-edit',
    scope: 'document',
    token: PageEditToken,
    create: createPageEditController,
  });
