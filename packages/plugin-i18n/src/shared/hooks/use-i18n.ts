import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { I18nPlugin } from '@embedpdf/plugin-i18n';
import { useState, useEffect, useCallback, useReducer } from '@framework';

export const useI18nCapability = () => useCapability<I18nPlugin>(I18nPlugin.id);
export const useI18nPlugin = () => usePlugin<I18nPlugin>(I18nPlugin.id);

/**
 * Hook to get a translate function for a component
 * Automatically updates all translations on locale or param changes
 *
 * @param documentId - Optional document ID for document-scoped translations
 * @returns translate function and current locale
 *
 * @example
 * const { translate } = useTranslations(documentId);
 * return (
 *   <div>
 *     <h1>{translate('page.title')}</h1>
 *     <p>{translate('page.count', { params: { count: 5 } })}</p>
 *     <p>{translate('unknown.key', { fallback: 'Default Text' })}</p>
 *   </div>
 * );
 */
export const useTranslations = (documentId?: string) => {
  const { provides } = useI18nCapability();
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  // Create a stable translate function with options support
  const translate = useCallback(
    (
      key: string,
      options?: {
        params?: Record<string, string | number>;
        fallback?: string;
      },
    ): string => {
      if (!provides) return options?.fallback ?? key;
      return provides.t(key, { documentId, params: options?.params, fallback: options?.fallback });
    },
    [provides, documentId],
  );

  useEffect(() => {
    if (!provides) return;

    // Update on locale change (all translations need to refresh)
    const unsubscribeLocale = provides.onLocaleChange(() => {
      forceUpdate();
    });

    // Update on params change (for keys with param resolvers)
    const unsubscribeParams = documentId
      ? provides.forDocument(documentId).onParamsChanged(() => {
          forceUpdate(); // Re-render component when any params change
        })
      : provides.onParamsChanged(() => {
          forceUpdate(); // Global params change
        });

    return () => {
      unsubscribeLocale();
      unsubscribeParams();
    };
  }, [provides, documentId]);

  return {
    translate,
    locale: provides?.getLocale() ?? 'en',
  };
};

// Keep the old hook for single-key translations (useful for derived state)
export const useTranslation = (
  key: string,
  options?: {
    params?: Record<string, string | number>;
    fallback?: string;
  },
  documentId?: string,
) => {
  const { translate } = useTranslations(documentId);
  return translate(key, options);
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
