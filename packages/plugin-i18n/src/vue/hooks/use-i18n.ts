import { ref, watch } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { I18nPlugin } from '@embedpdf/plugin-i18n';

export const useI18nCapability = () => useCapability<I18nPlugin>(I18nPlugin.id);
export const useI18nPlugin = () => usePlugin<I18nPlugin>(I18nPlugin.id);

export const useTranslation = (key: string, params?: Record<string, string | number>) => {
  const { provides } = useI18nCapability();
  const translation = ref<string>(key);

  watch(
    [provides, () => key, () => params],
    ([providesValue, keyValue, paramsValue], _, onCleanup) => {
      if (!providesValue) {
        translation.value = keyValue;
        return;
      }

      translation.value = providesValue.t(keyValue, paramsValue);

      const unsubscribe = providesValue.onLocaleChange(() => {
        translation.value = providesValue.t(keyValue, paramsValue);
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return translation;
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
