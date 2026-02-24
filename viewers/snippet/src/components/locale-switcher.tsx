import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useI18nCapability } from '@embedpdf/plugin-i18n/preact';

/**
 * Locale Switcher Component
 *
 * Displays a dropdown to switch between available locales
 */
export function LocaleSwitcher() {
  const { provides: i18n } = useI18nCapability();
  const [currentLocale, setCurrentLocale] = useState<string>('en');
  const [availableLocales, setAvailableLocales] = useState<string[]>([]);

  useEffect(() => {
    if (!i18n) return;

    // Get initial values
    setCurrentLocale(i18n.getLocale());
    setAvailableLocales(i18n.getAvailableLocales());

    // Subscribe to locale changes
    const unsubscribe = i18n.onLocaleChange(({ currentLocale }) => {
      setCurrentLocale(currentLocale);
    });

    return unsubscribe;
  }, [i18n]);

  if (!i18n || availableLocales.length <= 1) {
    return null; // Don't show if no i18n or only one locale
  }

  const handleLocaleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    const newLocale = target.value;
    if (newLocale && newLocale !== currentLocale) {
      i18n.setLocale(newLocale);
    }
  };

  const getLocaleName = (code: string) => {
    const localeInfo = i18n.getLocaleInfo(code);
    return localeInfo?.name || code.toUpperCase();
  };

  return (
    <div className="fixed right-4 top-4 z-50">
      <select
        value={currentLocale}
        onChange={handleLocaleChange}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        aria-label="Select language"
      >
        {availableLocales.map((localeCode) => (
          <option key={localeCode} value={localeCode}>
            {getLocaleName(localeCode)}
          </option>
        ))}
      </select>
    </div>
  );
}
