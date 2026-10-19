import { useI18n, useI18nState } from '@embedpdf/react/i18n';

export function LanguagePicker() {
  const i18n = useI18n();
  const { locale, locales, loading } = useI18nState();

  return (
    <select value={locale} disabled={loading !== null} onChange={(event) => i18n.setLocale(event.target.value)}>
      {locales.map((language) => (
        <option key={language.code} value={language.code}>
          {language.name}
        </option>
      ))}
    </select>
  );
}
