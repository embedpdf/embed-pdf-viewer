import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { I18nPlugin } from '@embedpdf/plugin-i18n';
import { useState, useEffect } from '@framework';

export const useI18nCapability = () => useCapability<I18nPlugin>(I18nPlugin.id);
export const useI18nPlugin = () => usePlugin<I18nPlugin>(I18nPlugin.id);

/**
 * Hook to translate a key
 * Returns translated string and automatically updates when locale changes
 */
export const useTranslation = (key: string, params?: Record<string, string | number>) => {
  const { provides } = useI18nCapability();
  const [translation, setTranslation] = useState<string>(() => provides?.t(key, params) ?? key);

  useEffect(() => {
    if (!provides) return;

    // Update translation on locale change
    const unsubscribe = provides.onLocaleChange(() => {
      setTranslation(provides.t(key, params));
    });

    // Update translation on mount
    setTranslation(provides.t(key, params));

    return unsubscribe;
  }, [provides, key, JSON.stringify(params)]);

  return translation;
};

/**
 * Hook to get current locale
 */
export const useLocale = () => {
  const { provides } = useI18nCapability();
  const [locale, setLocale] = useState<string>(() => provides?.getLocale() ?? 'en');

  useEffect(() => {
    if (!provides) return;

    const unsubscribe = provides.onLocaleChange(({ currentLocale }) => {
      setLocale(currentLocale);
    });

    setLocale(provides.getLocale());

    return unsubscribe;
  }, [provides]);

  return locale;
};
