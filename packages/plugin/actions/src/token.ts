/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it to the host capability. */
import { createCapabilityToken } from '@embedpdf/core';

import type { ActionsCapability } from './contract';

export const ActionsToken = createCapabilityToken<ActionsCapability>('actions', {
  hint: `add actionsPlugin() from '@embedpdf/plugin-actions' to your plugins list`,
});
