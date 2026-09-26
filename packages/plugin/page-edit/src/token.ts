/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { PageEditCapability } from './contract';

export const PageEditToken = createCapabilityToken<PageEditCapability>('page-edit', {
  hint: `add pageEditPlugin() from '@embedpdf/plugin-page-edit' to your plugins list`,
});
