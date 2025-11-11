import { BasePluginConfig, EventHook } from '@embedpdf/core';

export type TranslationKey = string;
export type LocaleCode = string; // 'en', 'es', 'fr', etc.

export interface TranslationDictionary {
  [key: string]: string | TranslationDictionary;
}

export interface Locale {
  code: LocaleCode;
  name: string;
  translations: TranslationDictionary;
}

export interface I18nPluginConfig extends BasePluginConfig {
  defaultLocale: LocaleCode;
  fallbackLocale?: LocaleCode;
  locales: Locale[];
}

export interface I18nState {
  currentLocale: LocaleCode;
  availableLocales: LocaleCode[];
}

export interface LocaleChangeEvent {
  previousLocale: LocaleCode;
  currentLocale: LocaleCode;
}

export interface I18nCapability {
  /**
   * Translate a key with optional parameters
   * @example t('commands.zoom.level', { level: 150 }) => "Zoom Level (150%)"
   */
  t(key: TranslationKey, params?: Record<string, string | number>): string;

  /**
   * Set the current locale
   */
  setLocale(locale: LocaleCode): void;

  /**
   * Get the current locale code
   */
  getLocale(): LocaleCode;

  /**
   * Get all available locale codes
   */
  getAvailableLocales(): LocaleCode[];

  /**
   * Get locale info by code
   */
  getLocaleInfo(code: LocaleCode): Locale | null;

  /**
   * Register a new locale (useful for plugins or user extensions)
   */
  registerLocale(locale: Locale): void;

  /**
   * Check if a locale is available
   */
  hasLocale(code: LocaleCode): boolean;

  /**
   * Event fired when locale changes
   */
  onLocaleChange: EventHook<LocaleChangeEvent>;
}
