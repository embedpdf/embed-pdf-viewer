/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { RedactionCapability } from './contract';

export const RedactionToken = createCapabilityToken<RedactionCapability>('redaction', {
  hint: `add redactionPlugin() from '@embedpdf/plugin-redaction' to your plugins list`,
});
