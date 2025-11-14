import { BasePluginConfig, EventHook, StoreState } from '@embedpdf/core';

export type TranslationKey = string;
export type LocaleCode = string;

// Param resolver function - receives optional documentId and state
export type ParamResolver<TStore = any> = (context: {
  state: TStore; // Direct use, no wrapper
  documentId?: string;
}) => Record<string, string | number>;

// Options for translation
export interface TranslateOptions {
  documentId?: string;
  params?: Record<string, string | number>;
  fallback?: string; // Fallback string if translation not found (will be interpolated)
}

// Options for scoped translation (without documentId)
export type ScopedTranslateOptions = Omit<TranslateOptions, 'documentId'>;

export type ParamResolvers<TStore = any> = Record<TranslationKey, ParamResolver<TStore>>;

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
  paramResolvers?: ParamResolvers;
}

export interface I18nState {
  currentLocale: LocaleCode;
  availableLocales: LocaleCode[];
}

export interface LocaleChangeEvent {
  previousLocale: LocaleCode;
  currentLocale: LocaleCode;
}

// NEW: Event when translation params change for a document
export interface TranslationParamsChangedData {
  changedKeys: TranslationKey[];
}

export interface TranslationParamsChangedEvent {
  documentId: string;
  changedKeys: TranslationKey[];
}

// NEW: Document-scoped API
export interface I18nScope {
  /**
   * Translate a key for this document
   * @param key - Translation key
   * @param options - Optional translation options (params, fallback)
   *
   * @example
   * const scoped = i18n.forDocument(documentId);
   * scoped.t('page.title')
   * scoped.t('page.count', { params: { count: 5 } })
   * scoped.t('unknown.key', { fallback: 'Default Text' })
   */
  t(key: TranslationKey, options?: ScopedTranslateOptions): string;

  /**
   * Event when translation params change for this document
   */
  onParamsChanged: EventHook<TranslationParamsChangedData>;
}

export interface I18nCapability {
  /**
   * Translate a key with optional context
   * If a param resolver is registered for this key, it will be called automatically
   *
   * @param key - Translation key
   * @param options - Optional translation options (documentId, params)
   *
   * @example
   * // Simple global translation
   * i18n.t('loading.viewer')
   *
   * // Global translation with params
   * i18n.t('document.total', { params: { amount: 5 } })
   *
   * // Document-scoped with param resolver
   * i18n.t('page.current', { documentId })
   *
   * // Document-scoped with explicit params
   * i18n.t('welcome', { documentId, params: { name: 'User' } })
   */
  t(key: TranslationKey, options?: TranslateOptions): string;

  /**
   * Get document-scoped API
   */
  forDocument(documentId: string): I18nScope;

  /**
   * Register a param resolver dynamically
   */
  registerParamResolver(key: TranslationKey, resolver: ParamResolver): void;

  /**
   * Unregister a param resolver
   */
  unregisterParamResolver(key: TranslationKey): void;

  setLocale(locale: LocaleCode): void;
  getLocale(): LocaleCode;
  getAvailableLocales(): LocaleCode[];
  getLocaleInfo(code: LocaleCode): Locale | null;
  registerLocale(locale: Locale): void;
  hasLocale(code: LocaleCode): boolean;

  // Events
  onLocaleChange: EventHook<LocaleChangeEvent>;
  onParamsChanged: EventHook<TranslationParamsChangedEvent>;
}
