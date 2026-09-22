/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` carries it for siblings. */
import { createCapabilityToken } from '@embedpdf/core';

import type { ViewManagerCapability } from './contract';

export const ViewManagerToken = createCapabilityToken<ViewManagerCapability>('view-manager', {
  hint: `add viewManagerPlugin() from '@embedpdf/plugin-view-manager' to your plugins list`,
});
