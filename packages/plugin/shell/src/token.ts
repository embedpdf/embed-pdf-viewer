/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` carries it for siblings. */
import { createCapabilityToken } from '@embedpdf/core';

import type { ShellCapability } from './contract';

export const ShellToken = createCapabilityToken<ShellCapability>('shell', {
  hint: `add shellPlugin() from '@embedpdf/plugin-shell' to your plugins list`,
});
