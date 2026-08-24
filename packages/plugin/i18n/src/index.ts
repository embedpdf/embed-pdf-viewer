export { i18nPlugin } from './i18n.plugin';
export { I18nToken } from './types';
export type {
  I18nCapability,
  I18nConfig,
  I18nState,
  Locale,
  LocaleInfo,
  TranslateOptions,
  TranslationDictionary,
} from './types';
export { negotiateLocale } from './negotiate';
// The pure lookup core — exported for tests and for hosts that translate
// outside a kernel (e.g. rendering an email from the same packs).
export { translate, interpolate } from './translate';
export type { TranslateResult } from './translate';
