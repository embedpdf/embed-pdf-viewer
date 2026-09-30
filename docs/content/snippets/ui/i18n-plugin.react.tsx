import { i18nPlugin, negotiateLocale } from '@embedpdf/react/i18n';
import en from './locales/en';

const locale = negotiateLocale(['en', 'nl', 'de'], navigator.languages) ?? 'en';

export const plugins = [
  /* … */
  i18nPlugin({
    locale,
    locales: [{ code: 'en', name: 'English', translations: en }],
    loaders: {
      nl: () => import('./locales/nl').then((module) => module.default),
      de: () => import('./locales/de').then((module) => module.default),
    },
  }),
];
