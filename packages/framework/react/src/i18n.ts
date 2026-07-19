/**
 * The React surface for @embedpdf/plugin-i18n — sugar over the generic
 * binding, nothing more. The plugin keeps locale packs in the store, so
 * reactivity is the kernel's one change stream; there are no emitters to
 * subscribe and no per-plugin plumbing.
 *
 * Because the capability is workspace-scoped and engine-free, these hooks
 * work from the FIRST frame — including inside `<Viewer fallback>` — while
 * the engine is still booting.
 */

// One-line-per-feature (ADAPTERS.md): registration travels with the UI.
export * from '@embedpdf/plugin-i18n';
import { useMemo } from 'react';
import { I18nToken } from '@embedpdf/plugin-i18n';
import type { LocaleInfo, TranslateOptions } from '@embedpdf/plugin-i18n';
import { useCapability, useKernelValue, useSelector } from './runtime';

/** The raw i18n capability (t / setLocale / locales / dir / …). */
export const useI18n = () => useCapability(I18nToken);

/**
 * A reactive translate function. New identity whenever i18n state changes
 * (locale switch, pack registered), so memoized children re-render too.
 *
 *   const t = useT();
 *   <button title={t('commands.zoom.in')}>+</button>
 *   <span>{t('pages', { params: { count } })}</span>
 */
export function useT(): (key: string, options?: TranslateOptions) => string {
  const i18n = useCapability(I18nToken);
  const slice = useKernelValue((k) => k.getState().plugins['i18n']);
  return useMemo(() => (key, options) => i18n.t(key, options), [i18n, slice]);
}

const localeListEqual = (a: LocaleInfo[], b: LocaleInfo[]): boolean =>
  a.length === b.length &&
  a.every((x, i) => x.code === b[i].code && x.name === b[i].name && x.loaded === b[i].loaded);

/**
 * Everything a locale switcher needs, reactive.
 *
 *   const { locale, locales, loading, setLocale } = useLocale();
 */
export function useLocale(): {
  locale: string;
  dir: 'ltr' | 'rtl';
  locales: LocaleInfo[];
  /** Code of a lazy pack being fetched, if any — show a spinner on it. */
  loading: string | null;
  setLocale: (code: string) => void;
} {
  const i18n = useCapability(I18nToken);
  const locale = useSelector(I18nToken, (c) => c.locale());
  const dir = useSelector(I18nToken, (c) => c.dir());
  const loading = useSelector(I18nToken, (c) => c.loading());
  const locales = useSelector(I18nToken, (c) => c.locales(), localeListEqual);
  return { locale, dir, locales, loading, setLocale: i18n.setLocale };
}
