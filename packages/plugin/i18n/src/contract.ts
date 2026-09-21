/**
 * @embedpdf/plugin-i18n/contract — translations and locale.
 *
 * Translation is pure data over pure state: locale packs live IN the store
 * (not in a side-table), so `t()` is a pure read, every consumer is reactive
 * through the one kernel change stream, and the whole thing serializes (SSR,
 * snapshots, persist). Workspace-scoped, `requires: []`, never touches the
 * engine or the DOM — the capability is alive from `createKernel()`, before
 * a single WASM byte is fetched. The plugin ships NO strings: mechanism here,
 * content (locale packs) in the product that embeds it.
 */
import type { EventHook, OperationOptions, PluginErrorInfo, Unsubscribe } from '@embedpdf/core';

export { I18nToken } from './token';

/** Nested tree of translation strings. Leaves interpolate `{param}` slots. */
export interface TranslationDictionary {
  readonly [key: string]: string | TranslationDictionary;
}

export interface Locale {
  /** BCP-47 code: 'en', 'es', 'ar', 'zh-Hans'. */
  readonly code: string;
  /** Native display name: 'Español' — what a locale switcher shows. */
  readonly name: string;
  /** Text direction for viewer chrome. Defaults to 'ltr'. */
  readonly dir?: 'ltr' | 'rtl';
  readonly translations: TranslationDictionary;
}

export interface I18nConfig {
  /**
   * Startup locale. Compute platform inputs OUTSIDE the plugin — it never
   * touches the DOM:
   *
   * ```ts
   * i18nPlugin({ locale: negotiateLocale(codes, navigator.languages) ?? 'en' })
   * ```
   *
   * May name a `loaders` pack: the fallback locale shows until the pack
   * arrives (effects fetch it at startup). Defaults to `fallbackLocale`.
   */
  locale?: string;
  /** The pack tried when a key misses the current locale. Default 'en'. */
  fallbackLocale?: string;
  /** Eagerly available packs. */
  locales?: Locale[];
  /**
   * Lazy packs: code → loader. `setLocale(code)` fetches on demand (in
   * effects), registers the pack, then switches. Until a lazy pack loads, a
   * locale switcher shows its code as the name — register eagerly (packs are
   * small) when you want native names in the switcher up front.
   */
  loaders?: Record<string, () => Promise<Locale>>;
}

export interface TranslateOptions {
  /**
   * `{slot}` interpolation values. When `count` is a number and the key
   * resolves to a branch object, the branch is picked by CLDR plural
   * category (`Intl.PluralRules`), falling back to `other`:
   *
   * ```ts
   * // pages: { one: '{count} page', other: '{count} pages' }
   * t('pages', { params: { count: 1 } }) // '1 page'
   * ```
   */
  params?: Record<string, string | number>;
  /** Returned (interpolated) when the key misses every pack — instead of the key. */
  fallback?: string;
}

/** A locale as a switcher sees it — registered packs plus not-yet-loaded lazy ones. */
export interface LocaleInfo {
  readonly code: string;
  /** Native name; the bare code until a lazy pack has loaded. */
  readonly name: string;
  readonly dir: 'ltr' | 'rtl';
  readonly loaded: boolean;
}
// ── events ──
export interface LocaleChangedEvent {
  readonly locale: string;
  readonly previousLocale: string;
}
export interface LocaleLoadFailedEvent {
  readonly locale: string;
  readonly error: PluginErrorInfo;
}

export interface I18nCapability {
  /** Translate a key: current locale → fallback locale → `options.fallback` → the key. The one bare-name read. */
  t(key: string, options?: TranslateOptions): string;
  /** Is a key translated in the current or fallback locale? Never warns. */
  hasKey(key: string): boolean;
  getLocale(): string;
  /** Text direction of the CURRENT locale — wire to `dir=` on the shell. */
  getDirection(): 'ltr' | 'rtl';
  /** Every known locale (registered + lazy), in registration order. Reference-stable. */
  listLocales(): readonly LocaleInfo[];
  /** Code of the lazy pack being fetched right now, if any. */
  getLoadingLocale(): string | null;
  /**
   * Switch locale. Resolves once the locale is usable (a lazy pack is fetched
   * first); rejects `not-found` for an unknown code, `operation-failed` when
   * the pack fails to load, and `operation-cancelled` when a newer call
   * supersedes this one.
   */
  setLocale(code: string, options?: OperationOptions): Promise<void>;
  /** Register a pack at runtime (customer-supplied translations). The remover drops it again. */
  registerLocale(locale: Locale): Unsubscribe;
  /** Merge keys into a registered pack (later keys win). Rejects `not-found` for an unknown code. */
  addTranslations(code: string, dictionary: TranslationDictionary): void;
  /** The current locale changed and is usable. */
  readonly onLocaleChanged: EventHook<LocaleChangedEvent>;
  /** A lazy pack failed to load; the previous locale stays. */
  readonly onLocaleLoadFailed: EventHook<LocaleLoadFailedEvent>;
}
