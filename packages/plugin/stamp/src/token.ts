/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { StampCapability } from './contract';

export const StampToken = createCapabilityToken<StampCapability>('stamp', {
  hint: `add stampPlugin() from '@embedpdf/plugin-stamp' to your plugins list`,
});
