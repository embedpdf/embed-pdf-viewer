/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` carries it for siblings. */
import { createCapabilityToken } from '@embedpdf/core';

import type { I18nCapability } from './contract';

export const I18nToken = createCapabilityToken<I18nCapability>('i18n', {
  hint: `add i18nPlugin() from '@embedpdf/plugin-i18n' to your plugins list`,
});
