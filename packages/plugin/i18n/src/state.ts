/**
 * The translations page's State table as code: what `useI18nState()` returns,
 * and the same fields in every other framework.
 */
import { defineState } from '@embedpdf/core';

import { I18nToken } from './contract';

export const i18nState = defineState(I18nToken, {
  read: (i18n) => ({
    locale: i18n.getLocale(),
    direction: i18n.getDirection(),
    locales: i18n.listLocales(),
    loading: i18n.getLoadingLocale(),
  }),
  empty: { locale: 'en', direction: 'ltr', locales: [], loading: null },
});
