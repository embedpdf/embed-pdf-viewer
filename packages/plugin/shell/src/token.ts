/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { ShellCapability } from './contract';

export const ShellToken = createCapabilityToken<ShellCapability>('shell', {
  hint: `add shellPlugin() from '@embedpdf/plugin-shell' to your plugins list`,
});
