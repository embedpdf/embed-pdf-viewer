/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it to the host capability. */
import { createCapabilityToken } from '@embedpdf/core';

import type { FormCapability } from './contract';

export const FormToken = createCapabilityToken<FormCapability>('form', {
  hint: `add formPlugin() from '@embedpdf/plugin-form' to your plugins list`,
});
