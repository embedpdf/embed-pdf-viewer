/**
 * The language tag the viewer writes dates, times and numbers in, as React context: the language
 * it shows, in the region of its reader (`formatLocaleOf`). It's worked out once for the whole
 * viewer, from the `locale` option and the language on screen, and follows both.
 *
 * Without a provider it's `undefined`, the browser's own formats: components render correctly in
 * tests and stories.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useI18nState } from '@embedpdf/react/i18n';

import { formatLocaleOf, readerLanguagesOf } from './locales';

const FormatLocaleContext = createContext<string | undefined>(undefined);

export function FormatLocaleProvider({
  locale,
  children,
}: {
  /** The viewer's `locale` option: `'auto'`, or a language's code. */
  locale: string;
  children: ReactNode;
}) {
  const shown = useI18nState((state) => state.locale);
  const languages = useI18nState((state) => state.locales);
  const formatLocale = useMemo(
    () =>
      formatLocaleOf(
        shown,
        languages.map((language) => language.code),
        readerLanguagesOf(locale),
      ),
    [shown, languages, locale],
  );
  return (
    <FormatLocaleContext.Provider value={formatLocale}>{children}</FormatLocaleContext.Provider>
  );
}

/** The tag to give `Intl` formatters: one the browser can read, or `undefined` for its own. */
export function useFormatLocale(): string | undefined {
  return useContext(FormatLocaleContext);
}
