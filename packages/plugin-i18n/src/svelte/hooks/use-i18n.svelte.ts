import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { I18nPlugin } from '@embedpdf/plugin-i18n';

export const useI18nCapability = () => useCapability<I18nPlugin>(I18nPlugin.id);
export const useI18nPlugin = () => usePlugin<I18nPlugin>(I18nPlugin.id);

export const useTranslation = (
  getKey: () => string,
  getParams?: () => Record<string, string | number> | undefined,
) => {
  const capability = useI18nCapability();

  let translation = $state<string>('');

  $effect(() => {
    const provides = capability.provides;
    const key = getKey();
    const params = getParams?.();

    if (!provides) {
      translation = key;
      return;
    }

    translation = provides.t(key, params);

    return provides.onLocaleChange(() => {
      translation = provides.t(key, params);
    });
  });

  return {
    get current() {
      return translation;
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
