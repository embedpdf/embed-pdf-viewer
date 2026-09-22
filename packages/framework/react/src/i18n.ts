/**
 * The React surface for @embedpdf/plugin-i18n — sugar over the generic
 * binding, nothing more. The plugin keeps locale packs in the store, so
 * reactivity is the kernel's one change stream; there are no emitters to
 * subscribe and no per-plugin plumbing.
 *
 * Because the capability is workspace-scoped and engine-free, these hooks
 * work from the first frame — including inside `<Viewer fallback>` — while
 * the engine is still booting.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-i18n';
import { I18nToken } from '@embedpdf/plugin-i18n';
import type { I18nCapability, LocaleInfo, TranslateOptions } from '@embedpdf/plugin-i18n';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent, useSelector } from './runtime';

/** The raw i18n capability (t / setLocale / listLocales / getDirection / …). */
export const useI18n = () => useCapability(I18nToken);

/** Subscribe to one i18n event for the mounted lifetime: `useI18nEvent((i18n) => i18n.onLocaleChanged, handler)`. */
export function useI18nEvent<T>(
  select: (i18n: I18nCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(I18nToken, select, handler);
}

/**
 * A reactive translate function. New identity exactly when the locale or the
 * registered translations change, so memoized children re-render too.
 *
 *   const t = useT();
 *   <button title={t('commands.zoom.in')}>+</button>
 *   <span>{t('pages', { params: { count } })}</span>
 */
export function useT(): (key: string, options?: TranslateOptions) => string {
  return useSelector(I18nToken, (i18n) => i18n.getTranslator());
}

const localeListEqual = (left: readonly LocaleInfo[], right: readonly LocaleInfo[]): boolean =>
  left.length === right.length &&
  left.every(
    (locale, i) =>
      locale.code === right[i].code &&
      locale.name === right[i].name &&
      locale.loaded === right[i].loaded,
  );

/**
 * Everything a locale switcher needs, reactive.
 *
 *   const { locale, locales, loading, setLocale } = useLocale();
 */
export function useLocale(): {
  locale: string;
  dir: 'ltr' | 'rtl';
  locales: readonly LocaleInfo[];
  /** Code of a lazy pack being fetched, if any — show a spinner on it. */
  loading: string | null;
  /** Resolves once the locale is usable (a lazy pack is fetched first). */
  setLocale: (code: string) => Promise<void>;
} {
  const i18n = useCapability(I18nToken);
  const locale = useSelector(I18nToken, (i18n) => i18n.getLocale());
  const dir = useSelector(I18nToken, (i18n) => i18n.getDirection());
  const loading = useSelector(I18nToken, (i18n) => i18n.getLoadingLocale());
  const locales = useSelector(I18nToken, (i18n) => i18n.listLocales(), localeListEqual);
  return { locale, dir, locales, loading, setLocale: i18n.setLocale };
}
