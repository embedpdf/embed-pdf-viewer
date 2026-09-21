/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` carries it for siblings. */
import { createCapabilityToken } from '@embedpdf/core';

import type { PageEditCapability } from './contract';

export const PageEditToken = createCapabilityToken<PageEditCapability>('page-edit', {
  hint: `add pageEditPlugin() from '@embedpdf/plugin-page-edit' to your plugins list`,
});
