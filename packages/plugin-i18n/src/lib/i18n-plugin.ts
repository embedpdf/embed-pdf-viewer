import { BasePlugin, PluginRegistry, createEmitter } from '@embedpdf/core';
import {
  I18nCapability,
  I18nPluginConfig,
  I18nState,
  Locale,
  LocaleCode,
  LocaleChangeEvent,
  TranslationKey,
} from './types';
import {
  I18nAction,
  setLocale as setLocaleAction,
  registerLocale as registerLocaleAction,
} from './actions';

export class I18nPlugin extends BasePlugin<
  I18nPluginConfig,
  I18nCapability,
  I18nState,
  I18nAction
> {
  static readonly id = 'i18n' as const;

  private config: I18nPluginConfig;
  private locales = new Map<LocaleCode, Locale>();
  private readonly localeChange$ = createEmitter<LocaleChangeEvent>();

  constructor(id: string, registry: PluginRegistry, config: I18nPluginConfig) {
    super(id, registry);

    this.config = config;

    // Register all provided locales
    config.locales.forEach((locale) => {
      this.locales.set(locale.code, locale);
      this.dispatch(registerLocaleAction(locale.code));
    });

    // Set initial locale
    this.dispatch(setLocaleAction(config.defaultLocale));
  }

  async initialize(): Promise<void> {
    this.logger.info('I18nPlugin', 'Initialize', 'I18n plugin initialized');
  }

  async destroy(): Promise<void> {
    this.localeChange$.clear();
    super.destroy();
  }

  protected buildCapability(): I18nCapability {
    return {
      t: (key, params) => this.translate(key, params),
      setLocale: (locale) => this.setLocale(locale),
      getLocale: () => this.state.currentLocale,
      getAvailableLocales: () => [...this.state.availableLocales],
      getLocaleInfo: (code) => this.locales.get(code) ?? null,
      registerLocale: (locale) => this.registerLocale(locale),
      hasLocale: (code) => this.locales.has(code),
      onLocaleChange: this.localeChange$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Translation Logic
  // ─────────────────────────────────────────────────────────

  private translate(key: TranslationKey, params?: Record<string, string | number>): string {
    const locale = this.locales.get(this.state.currentLocale);
    const fallbackLocale = this.config.fallbackLocale
      ? this.locales.get(this.config.fallbackLocale)
      : null;

    // Try current locale
    let value = this.getNestedValue(locale?.translations, key);

    // Try fallback locale
    if (!value && fallbackLocale) {
      value = this.getNestedValue(fallbackLocale.translations, key);
    }

    // If still not found, return the key itself (with warning)
    if (!value) {
      this.logger.warn('I18nPlugin', 'MissingTranslation', `Translation not found for key: ${key}`);
      return key;
    }

    // Interpolate parameters
    return this.interpolate(value, params);
  }

  private getNestedValue(obj: any, path: string): string | undefined {
    if (!obj) return undefined;

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }

    return typeof current === 'string' ? current : undefined;
  }

  private interpolate(str: string, params?: Record<string, string | number>): string {
    if (!params) return str;

    // Replace {key} with params[key]
    return str.replace(/\{(\w+)\}/g, (match, key) => {
      const value = params[key];
      return value !== undefined ? String(value) : match;
    });
  }

  // ─────────────────────────────────────────────────────────
  // Locale Management
  // ─────────────────────────────────────────────────────────

  private setLocale(locale: LocaleCode): void {
    if (!this.locales.has(locale)) {
      this.logger.warn('I18nPlugin', 'LocaleNotFound', `Locale '${locale}' is not registered`);
      return;
    }

    const previousLocale = this.state.currentLocale;
    if (previousLocale === locale) return; // No change

    this.dispatch(setLocaleAction(locale));

    this.localeChange$.emit({
      previousLocale,
      currentLocale: locale,
    });

    this.logger.info('I18nPlugin', 'LocaleChanged', `Locale changed to: ${locale}`);
  }

  private registerLocale(locale: Locale): void {
    if (this.locales.has(locale.code)) {
      this.logger.warn(
        'I18nPlugin',
        'LocaleAlreadyRegistered',
        `Locale '${locale.code}' is already registered`,
      );
      return;
    }

    this.locales.set(locale.code, locale);
    this.dispatch(registerLocaleAction(locale.code));

    this.logger.info('I18nPlugin', 'LocaleRegistered', `Locale registered: ${locale.code}`);
  }
}
