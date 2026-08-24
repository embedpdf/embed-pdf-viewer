import { definePlugin } from '@embedpdf/core';
import { createPageEditCapability } from './capability';
import { PageEditToken } from './types';

/**
 * Document-scoped, stateless: turns the engine handle's page service into a
 * PON-addressed edit capability. The relative→absolute rotation lives in the
 * capability so the four framework adapters never re-derive it, and this is the
 * home for client-side edit state (pending/optimistic/undo) when it lands —
 * adapters keep their thin hook over `PageEditToken` unchanged.
 */
export const pageEditPlugin = () =>
  definePlugin({
    id: 'page-edit',
    scope: 'document',
    token: PageEditToken,
    capability: createPageEditCapability,
  });
