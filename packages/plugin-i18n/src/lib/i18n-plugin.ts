import {
  BasePlugin,
  PluginRegistry,
  StoreState,
  arePropsEqual,
  createEmitter,
  createScopedEmitter,
} from '@embedpdf/core';
import {
  I18nCapability,
  I18nPluginConfig,
  I18nState,
  I18nScope,
  Locale,
  LocaleCode,
  LocaleChangeEvent,
  TranslationKey,
  TranslateOptions,
  ParamResolver,
  TranslationParamsChangedData,
  TranslationParamsChangedEvent,
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
  private paramResolvers = new Map<TranslationKey, ParamResolver>();

  // Cache resolved params per document per key
  // Map<documentId, Map<translationKey, resolvedParams>>
  private paramsCache = new Map<string, Map<TranslationKey, Record<string, string | number>>>();

  // Events
  private readonly localeChange$ = createEmitter<LocaleChangeEvent>();
  private readonly paramsChanged$ = createScopedEmitter<
    TranslationParamsChangedData,
    TranslationParamsChangedEvent,
    string
  >((documentId, data) => ({ documentId, ...data }), { cache: false });

  constructor(id: string, registry: PluginRegistry, config: I18nPluginConfig) {
    super(id, registry);

    this.config = config;

    // Register all provided locales
    config.locales.forEach((locale) => {
      this.locales.set(locale.code, locale);
      this.dispatch(registerLocaleAction(locale.code));
    });

    // Register param resolvers
    if (config.paramResolvers) {
      Object.entries(config.paramResolvers).forEach(([key, resolver]) => {
        this.paramResolvers.set(key, resolver);
      });
    }

    // Set initial locale
    this.dispatch(setLocaleAction(config.defaultLocale));

    // Subscribe to global store changes for param change detection
    this.registry.getStore().subscribe((_action, newState) => {
      this.detectParamChanges(newState);
    });
  }

  async initialize(): Promise<void> {
    this.logger.info('I18nPlugin', 'Initialize', 'I18n plugin initialized');
  }

  async destroy(): Promise<void> {
    this.localeChange$.clear();
    this.paramsChanged$.clear();
    this.paramResolvers.clear();
    this.paramsCache.clear();
    super.destroy();
  }

  protected override onDocumentClosed(documentId: string): void {
    // Clean up cache for closed document
    this.paramsCache.delete(documentId);
    this.paramsChanged$.clearScope(documentId);

    this.logger.debug(
      'I18nPlugin',
      'DocumentClosed',
      `Cleaned up params cache for document: ${documentId}`,
    );
  }

  protected buildCapability(): I18nCapability {
    return {
      t: (key, options) => this.translate(key, options),
      forDocument: (documentId) => this.createI18nScope(documentId),
      registerParamResolver: (key, resolver) => this.registerParamResolver(key, resolver),
      unregisterParamResolver: (key) => this.unregisterParamResolver(key),
      setLocale: (locale) => this.setLocale(locale),
      getLocale: () => this.state.currentLocale,
      getAvailableLocales: () => [...this.state.availableLocales],
      getLocaleInfo: (code) => this.locales.get(code) ?? null,
      registerLocale: (locale) => this.registerLocale(locale),
      hasLocale: (code) => this.locales.has(code),
      onLocaleChange: this.localeChange$.on,
      onParamsChanged: this.paramsChanged$.onGlobal,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createI18nScope(documentId: string): I18nScope {
    return {
      t: (key, options) => this.translate(key, { documentId, ...options }),
      onParamsChanged: this.paramsChanged$.forScope(documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Translation Logic
  // ─────────────────────────────────────────────────────────

  private translate(key: TranslationKey, options?: TranslateOptions): string {
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

    // If still not found, use fallback or return key
    if (!value) {
      if (options?.fallback) {
        // Use provided fallback string
        value = options.fallback;
      } else {
        this.logger.warn(
          'I18nPlugin',
          'MissingTranslation',
          `Translation not found for key: ${key}`,
        );
        return key;
      }
    }

    // Resolve params: explicit params take precedence over registered resolvers
    let params = options?.params;

    // If no explicit params and we have a resolver, try to resolve
    if (!params && this.paramResolvers.has(key)) {
      params = this.resolveParams(key, options?.documentId);
    }

    // Interpolate parameters (works for both found translations and fallback)
    return this.interpolate(value, params);
  }

  private resolveParams(
    key: TranslationKey,
    documentId?: string,
  ): Record<string, string | number> | undefined {
    const resolver = this.paramResolvers.get(key);
    if (!resolver) return undefined;

    const state = this.registry.getStore().getState();

    try {
      // Pass documentId (which may be undefined) to resolver
      return resolver({ state, documentId });
    } catch (error) {
      this.logger.error(
        'I18nPlugin',
        'ParamResolverError',
        `Error resolving params for key "${key}":`,
        error,
      );
      return undefined;
    }
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
  // Smart Param Change Detection
  // ─────────────────────────────────────────────────────────

  private detectParamChanges(newState: StoreState<any>): void {
    // Get all documents from core state
    const documentIds = Object.keys(newState.core.documents);

    documentIds.forEach((documentId) => {
      this.detectDocumentParamChanges(documentId, newState);
    });
  }

  private detectDocumentParamChanges(documentId: string, newState: StoreState<any>): void {
    const previousCache = this.paramsCache.get(documentId);
    const changedKeys: TranslationKey[] = [];

    // Re-resolve all params that have resolvers
    this.paramResolvers.forEach((resolver, key) => {
      try {
        const newParams = resolver({ state: newState, documentId });
        const prevParams = previousCache?.get(key);

        // Compare params (deep equality for simplicity)
        if (!arePropsEqual(prevParams, newParams)) {
          changedKeys.push(key);

          // Update cache
          if (!this.paramsCache.has(documentId)) {
            this.paramsCache.set(documentId, new Map());
          }
          this.paramsCache.get(documentId)!.set(key, newParams);
        }
      } catch (error) {
        this.logger.error(
          'I18nPlugin',
          'ParamDetectionError',
          `Error detecting param changes for key "${key}":`,
          error,
        );
      }
    });

    // Emit event if any params changed
    if (changedKeys.length > 0) {
      this.paramsChanged$.emit(documentId, { changedKeys });

      this.logger.debug(
        'I18nPlugin',
        'ParamsChanged',
        `Translation params changed for document ${documentId}:`,
        changedKeys,
      );
    }
  }

  // ─────────────────────────────────────────────────────────
  // Param Resolver Management
  // ─────────────────────────────────────────────────────────

  private registerParamResolver(key: TranslationKey, resolver: ParamResolver): void {
    if (this.paramResolvers.has(key)) {
      this.logger.warn(
        'I18nPlugin',
        'ResolverOverwrite',
        `Param resolver for "${key}" already exists and will be overwritten`,
      );
    }

    this.paramResolvers.set(key, resolver);

    // Clear cache for this key in all documents
    this.paramsCache.forEach((docCache) => {
      docCache.delete(key);
    });

    this.logger.debug('I18nPlugin', 'ResolverRegistered', `Param resolver registered for: ${key}`);
  }

  private unregisterParamResolver(key: TranslationKey): void {
    if (this.paramResolvers.delete(key)) {
      // Clear cache for this key in all documents
      this.paramsCache.forEach((docCache) => {
        docCache.delete(key);
      });

      this.logger.debug(
        'I18nPlugin',
        'ResolverUnregistered',
        `Param resolver unregistered for: ${key}`,
      );
    }
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
    if (previousLocale === locale) return;

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
