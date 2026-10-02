/**
 * The i18n plugin's readers. The plugin belongs to the workspace and needs no engine, so they
 * work from the first frame, before a document opens: a loading screen and a password prompt
 * translate too.
 */
import type { EventHook } from '@embedpdf/core';
import { I18nToken, i18nState } from '@embedpdf/plugin-i18n';
import type { I18nCapability, TranslateOptions } from '@embedpdf/plugin-i18n';
import { useCapability, useCapabilityEvent, useSelector } from '../runtime/readers.svelte';
import { settingsReader, stateReader } from '../runtime/state.svelte';

/** The i18n API: `t`, `setLocale`, `addTranslations`, `registerLocale`, the settings calls. */
export function useI18n(): I18nCapability {
  return useCapability(I18nToken);
}

/** Subscribe to one i18n event while the component lives: `useI18nEvent((i18n) => i18n.onLocaleChanged, handler)`. */
export function useI18nEvent<T>(
  select: (i18n: I18nCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(I18nToken, select, handler);
}

/**
 * The current language, how it reads, every language you can switch to, and the one loading
 * (declared once in `i18nState`), as a reactive object (`useI18nState().direction`). Takes a
 * selector.
 */
export const useI18nState = stateReader(i18nState);

/** The i18n settings (`locale`, `fallbackLocale`, `locales`, `loaders`). Takes a selector. */
export const useI18nSettings = settingsReader(I18nToken);

/**
 * A translate function that reads the current language each time it's called, so a template, a
 * `$derived` or an effect that calls it updates when the language or the strings change:
 *
 *   const t = useT();
 *   <span>{t('search.results', { params: { count } })}</span>
 */
export function useT(): (key: string, options?: TranslateOptions) => string {
  const translator = useSelector(I18nToken, (i18n) => i18n.getTranslator());
  return (key, options) => translator.current(key, options);
}
