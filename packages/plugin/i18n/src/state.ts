/**
 * The translations page's State table as code: what `useI18nState()` returns,
 * and the same fields in every other framework.
 */
import { defineState } from '@embedpdf/core';

import { I18nToken, type LocaleInfo, type TextDirection } from './contract';

/** The current language, how it reads, the languages to switch to, and the one loading. */
export interface I18nState {
  /** The current language's code. */
  readonly locale: string;
  /** How the current language reads: set it as `dir` on your viewer's root. */
  readonly direction: TextDirection;
  /** Every language you can switch to, loaded or not, in the order they were added. */
  readonly locales: readonly LocaleInfo[];
  /** The code of the language being loaded, or `null`. */
  readonly loading: string | null;
}

export const i18nState = defineState(I18nToken, {
  read: (i18n): I18nState => ({
    locale: i18n.getLocale(),
    direction: i18n.getDirection(),
    locales: i18n.listLocales(),
    loading: i18n.getLoadingLocale(),
  }),
  empty: { locale: 'en', direction: 'ltr', locales: [], loading: null },
});
