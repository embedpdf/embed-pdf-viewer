/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it to the host capability. Additional lenses
 *  mint their own token (see `stagePlugin`'s options). */
import { createCapabilityToken } from '@embedpdf/core';

import type { StageCapability } from './contract';

export const StageToken = createCapabilityToken<StageCapability>('stage', {
  hint: `add stagePlugin() from '@embedpdf/plugin-stage' to your plugins list`,
});
