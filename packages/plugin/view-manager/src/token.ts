/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { ViewManagerCapability } from './contract';

export const ViewManagerToken = createCapabilityToken<ViewManagerCapability>('view-manager', {
  hint: `add viewManagerPlugin() from '@embedpdf/plugin-view-manager' to your plugins list`,
});
