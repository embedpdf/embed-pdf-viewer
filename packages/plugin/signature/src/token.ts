/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { SignatureCapability } from './contract';

export const SignatureToken = createCapabilityToken<SignatureCapability>('signature', {
  hint: `add signaturePlugin() from '@embedpdf/plugin-signature' to your plugins list`,
});
