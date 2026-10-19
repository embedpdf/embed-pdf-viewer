/** The package token, created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it. */
import { createCapabilityToken } from '@embedpdf/core';

import type { InteractionCapability } from './contract';

export const InteractionToken = createCapabilityToken<InteractionCapability>('interaction', {
  hint: `add interactionPlugin() from '@embedpdf/plugin-interaction' to your plugins list`,
});
