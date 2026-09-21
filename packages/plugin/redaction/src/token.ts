/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` carries it for siblings. */
import { createCapabilityToken } from '@embedpdf/core';

import type { RedactionCapability } from './contract';

export const RedactionToken = createCapabilityToken<RedactionCapability>('redaction', {
  hint: `add redactionPlugin() from '@embedpdf/plugin-redaction' to your plugins list`,
});
