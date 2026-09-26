/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { I18nCapability } from './contract';

export const I18nToken = createCapabilityToken<I18nCapability>('i18n', {
  hint: `add i18nPlugin() from '@embedpdf/plugin-i18n' to your plugins list`,
});
