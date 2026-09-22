/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` carries it for siblings. */
import { createCapabilityToken } from '@embedpdf/core';

import type { SignatureCapability } from './contract';

export const SignatureToken = createCapabilityToken<SignatureCapability>('signature', {
  hint: `add signaturePlugin() from '@embedpdf/plugin-signature' to your plugins list`,
});
