import { useCallback } from '@framework';
import type { Locale, TranslationDictionary } from '../../lib/types';

/**
 * Resolves a translation key from locale data statically before the i18n plugin is initialized.
 * Used for early loading states that appear before plugins are ready.
 */
export function getStaticTranslation(
  locales: Locale[],
  defaultLocale: string,
  key: string,
  fallback?: string,
): string {
  if (!locales || locales.length === 0) return fallback ?? key;
  
  const locale = locales.find((l) => l.code === defaultLocale) ?? locales[0];
  if (!locale) return fallback ?? key;

  const parts = key.split('.');
  let current: TranslationDictionary | string = locale.translations;
  for (const part of parts) {
    if (typeof current === 'string') return fallback ?? key;
    current = current[part];
    if (current === undefined) return fallback ?? key;
  }
  return typeof current === 'string' ? current : (fallback ?? key);
}

/**
 * Hook that returns a static translation function for use before dthe i18n system is ready.
 * 
 * @param config Locales and default locale to use for resolution
 * @returns A translation function that takes a key and returns the translated string
 */

const EMPTY_ARRAY: Locale[] = [];

export function useStaticTranslation(
  config?: { locales?: Locale[]; defaultLocale?: string }
) {
  const locales = config?.locales || EMPTY_ARRAY;
  const defaultLocale = config?.defaultLocale || 'en';

  return useCallback(
    (key: string, fallback?: string) => getStaticTranslation(locales, defaultLocale, key, fallback),
    [locales, defaultLocale]
  );
}

