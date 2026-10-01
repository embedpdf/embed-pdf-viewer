/**
 * The React surface for @embedpdf/plugin-i18n. The plugin is workspace-scoped
 * and needs no engine, so these hooks work from the first frame, before a
 * document opens: a loading screen and a password prompt translate too.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-i18n';
import { I18nToken, i18nState } from '@embedpdf/plugin-i18n';
import type { I18nCapability, TranslateOptions } from '@embedpdf/plugin-i18n';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent, useSelector } from './runtime';
import { settingsHook, stateHook } from './state';

/** The i18n capability: `t`, `setLocale`, `addTranslations`, `registerLocale`, the settings calls. */
export function useI18n(): I18nCapability {
  return useCapability(I18nToken);
}

/** Subscribe to one i18n event for the mounted lifetime: `useI18nEvent((i18n) => i18n.onLocaleChanged, handler)`. */
export function useI18nEvent<T>(
  select: (i18n: I18nCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(I18nToken, select, handler);
}

/**
 * The current language, how it reads, every language you can switch to, and the one loading (the
 * translations page's State table, declared once in `i18nState`). Takes a selector, and
 * re-renders only when what it returns changes.
 */
export const useI18nState = stateHook(i18nState);

/** The i18n settings (`locale`, `fallbackLocale`, `locales`, `loaders`). Takes a selector. */
export const useI18nSettings = settingsHook(I18nToken);

/**
 * A translate function that re-renders the component when the language or the strings change,
 * and keeps its identity otherwise, so memoized children holding it re-render too.
 *
 *   const t = useT();
 *   <span>{t('search.results', { params: { count } })}</span>
 */
export function useT(): (key: string, options?: TranslateOptions) => string {
  return useSelector(I18nToken, (i18n) => i18n.getTranslator());
}
