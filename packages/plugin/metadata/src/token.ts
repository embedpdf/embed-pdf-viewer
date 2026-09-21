/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it. */
import { createCapabilityToken } from '@embedpdf/core';

import type { MetadataCapability } from './contract';

export const MetadataToken = createCapabilityToken<MetadataCapability>('metadata', {
  hint: "add metadataPlugin() from '@embedpdf/plugin-metadata' to your plugins list",
});
