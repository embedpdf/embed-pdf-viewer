import { ref, watch, computed, readonly, toValue, MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { I18nPlugin } from '@embedpdf/plugin-i18n';

export const useI18nCapability = () => useCapability<I18nPlugin>(I18nPlugin.id);
export const useI18nPlugin = () => usePlugin<I18nPlugin>(I18nPlugin.id);

/**
 * Hook to get a translate function for a component
 * Automatically updates all translations on locale or param changes
 *
 * @param documentId - Optional document ID for document-scoped translations (can be ref, computed, getter, or plain value)
 * @returns translate function and current locale
 *
 * @example
 * const { translate, locale } = useTranslations(documentId);
 * // In template:
 * {{ translate('page.title') }}
 * {{ translate('page.count', { params: { count: 5 } }) }}
 * {{ translate('unknown.key', { fallback: 'Default Text' }) }}
 */
export const useTranslations = (documentId?: MaybeRefOrGetter<string | undefined>) => {
  const { provides } = useI18nCapability();
  const forceUpdateCounter = ref(0);

  // Watch for locale and params changes
  watch(
    [provides, () => (documentId ? toValue(documentId) : undefined)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue) return;

      // Subscribe to locale changes
      const unsubscribeLocale = providesValue.onLocaleChange(() => {
        forceUpdateCounter.value++;
      });

      // Subscribe to params changes
      const unsubscribeParams = docId
        ? providesValue.forDocument(docId).onParamsChanged(() => {
            forceUpdateCounter.value++;
          })
        : providesValue.onParamsChanged(() => {
            forceUpdateCounter.value++;
          });

      onCleanup(() => {
        unsubscribeLocale();
        unsubscribeParams();
      });
    },
    { immediate: true },
  );

  // Create translate function
  const translate = (
    key: string,
    options?: {
      params?: Record<string, string | number>;
      fallback?: string;
    },
  ): string => {
    // Access forceUpdateCounter to trigger reactivity
    forceUpdateCounter.value;

    const providesValue = provides.value;
    if (!providesValue) return options?.fallback ?? key;

    const docId = documentId ? toValue(documentId) : undefined;
    return providesValue.t(key, {
      documentId: docId,
      params: options?.params,
      fallback: options?.fallback,
    });
  };

  const locale = computed(() => provides.value?.getLocale() ?? 'en');

  return {
    translate,
    locale: readonly(locale),
  };
};

// Keep the old hook for single-key translations (useful for derived state)
export const useTranslation = (
  key: string,
  options?: {
    params?: Record<string, string | number>;
    fallback?: string;
  },
  documentId?: MaybeRefOrGetter<string | undefined>,
) => {
  const { translate } = useTranslations(documentId);
  return computed(() => translate(key, options));
};

export const useLocale = () => {
  const { provides } = useI18nCapability();
  const locale = ref<string>('en');

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (!providesValue) return;

      locale.value = providesValue.getLocale();

      const unsubscribe = providesValue.onLocaleChange(({ currentLocale }) => {
        locale.value = currentLocale;
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return locale;
};
