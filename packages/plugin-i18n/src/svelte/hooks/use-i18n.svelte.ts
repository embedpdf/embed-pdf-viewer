import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { I18nPlugin } from '@embedpdf/plugin-i18n';

export const useI18nCapability = () => useCapability<I18nPlugin>(I18nPlugin.id);
export const useI18nPlugin = () => usePlugin<I18nPlugin>(I18nPlugin.id);

/**
 * Hook to get a translate function for a component
 * Automatically updates all translations on locale or param changes
 *
 * @param getDocumentId - Function that returns the document ID for document-scoped translations
 * @returns translate function and current locale
 *
 * @example
 * const { translate, locale } = useTranslations(() => documentId);
 * // In template:
 * {translate('page.title')}
 * {translate('page.count', { params: { count: 5 } })}
 * {translate('unknown.key', { fallback: 'Default Text' })}
 */
export const useTranslations = (getDocumentId?: () => string | undefined) => {
  const capability = useI18nCapability();

  let forceUpdateCounter = $state(0);

  // Reactive documentId
  const documentId = $derived(getDocumentId?.());

  $effect(() => {
    const provides = capability.provides;
    const docId = documentId;

    if (!provides) return;

    // Subscribe to locale changes
    const unsubscribeLocale = provides.onLocaleChange(() => {
      forceUpdateCounter++;
    });

    // Subscribe to params changes
    const unsubscribeParams = docId
      ? provides.forDocument(docId).onParamsChanged(() => {
          forceUpdateCounter++;
        })
      : provides.onParamsChanged(() => {
          forceUpdateCounter++;
        });

    return () => {
      unsubscribeLocale();
      unsubscribeParams();
    };
  });

  // Create translate function
  const translate = (
    key: string,
    options?: {
      params?: Record<string, string | number>;
      fallback?: string;
    },
  ): string => {
    // Access forceUpdateCounter to trigger reactivity
    forceUpdateCounter;

    const provides = capability.provides;
    if (!provides) return options?.fallback ?? key;

    const docId = getDocumentId?.();
    return provides.t(key, {
      documentId: docId,
      params: options?.params,
      fallback: options?.fallback,
    });
  };

  return {
    translate,
    get locale() {
      return capability.provides?.getLocale() ?? 'en';
    },
  };
};

// Keep the old hook for single-key translations (useful for derived state)
export const useTranslation = (
  getKey: () => string,
  getOptions?: () =>
    | {
        params?: Record<string, string | number>;
        fallback?: string;
      }
    | undefined,
  getDocumentId?: () => string | undefined,
) => {
  const { translate } = useTranslations(getDocumentId);

  return {
    get current() {
      return translate(getKey(), getOptions?.());
    },
  };
};

export const useLocale = () => {
  const capability = useI18nCapability();

  let locale = $state<string>('en');

  $effect(() => {
    const provides = capability.provides;

    if (!provides) return;

    locale = provides.getLocale();

    return provides.onLocaleChange(({ currentLocale }) => {
      locale = currentLocale;
    });
  });

  return {
    get current() {
      return locale;
    },
  };
};
