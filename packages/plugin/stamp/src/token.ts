/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` carries it for siblings. */
import { createCapabilityToken } from '@embedpdf/core';

import type { StampCapability } from './contract';

export const StampToken = createCapabilityToken<StampCapability>('stamp', {
  hint: `add stampPlugin() from '@embedpdf/plugin-stamp' to your plugins list`,
});
