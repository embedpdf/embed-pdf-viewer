/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it. */
import { createCapabilityToken } from '@embedpdf/core';

import type { SearchCapability } from './contract';

export const SearchToken = createCapabilityToken<SearchCapability>('search', {
  hint: "add searchPlugin() from '@embedpdf/plugin-search' to your plugins list",
});
