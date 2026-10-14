/**
 * @embedpdf/vue/i18n: the Vue surface of `@embedpdf/plugin-i18n`. The plugin
 * belongs to the workspace and needs no engine, so these composables work from
 * the first frame, before a document opens: a loading screen and a password
 * prompt translate too.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-i18n';
import { I18nToken, i18nState } from '@embedpdf/plugin-i18n';
import type { I18nCapability, TranslateOptions } from '@embedpdf/plugin-i18n';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent, useSelector } from './runtime/capabilities';
import { settingsComposable, stateComposable } from './state';

/** The i18n API: `t`, `setLocale`, `addTranslations`, `registerLocale`, the settings calls. The object never changes. */
export function useI18n(): I18nCapability {
  return useCapability(I18nToken);
}

/** Subscribe to one i18n event while the component lives: `useI18nEvent((i18n) => i18n.onLocaleChanged, handler)`. */
export function useI18nEvent<Event>(
  select: (i18n: I18nCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(I18nToken, select, handler);
}

/**
 * The current language, how it reads, every language you can switch to, and
 * the one loading, as refs (the translations page's State table, declared once
 * in `i18nState`). With a selector, one ref, which updates only when what it
 * picks changes.
 */
export const useI18nState = stateComposable(i18nState);

/** The i18n settings (`locale`, `fallbackLocale`, `locales`, `loaders`) as refs. Takes a selector. */
export const useI18nSettings = settingsComposable(I18nToken);

/**
 * A translate function that reads the language reactively: a template, a
 * computed or a `watch` that calls it updates when the language or the strings
 * change. The function itself never changes, so it can be kept anywhere.
 *
 *   const t = useT();
 *   <span>{{ t('search.results', { params: { count } }) }}</span>
 */
export function useT(): (key: string, options?: TranslateOptions) => string {
  // The plugin hands out a new translator when the language or the strings change;
  // reading the ref inside the call is what makes the caller depend on it.
  const translator = useSelector(I18nToken, (i18n) => i18n.getTranslator());
  return (key, options) => translator.value(key, options);
}
