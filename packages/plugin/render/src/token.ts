/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it. */
import { createCapabilityToken } from '@embedpdf/core';

import type { RenderCapability } from './contract';

export const RenderToken = createCapabilityToken<RenderCapability>('render', {
  hint: `add renderPlugin() from '@embedpdf/plugin-render' to your plugins list`,
});
