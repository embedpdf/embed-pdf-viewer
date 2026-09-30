import { useI18nEvent } from '@embedpdf/react/i18n';

export function DocumentLanguage() {
  useI18nEvent(
    (i18n) => i18n.onLocaleChanged,
    ({ locale }) => document.documentElement.setAttribute('lang', locale),
  );
  return null;
}
