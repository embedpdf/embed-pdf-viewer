import { createCapabilityToken } from '@embedpdf/core';

/**
 * @embedpdf/plugin-i18n — the contract.
 *
 * Translation is pure data over pure state: locale packs live IN the store
 * (not in a side-table), so `t()` is a pure read, every consumer is reactive
 * through the one kernel change stream, and the whole thing serializes (SSR,
 * snapshots, persist). Workspace-scoped, `requires: []`, never touches the
 * engine or the DOM — the capability is alive from `createKernel()`, before
 * a single WASM byte is fetched. The plugin ships NO strings: mechanism here,
 * content (locale packs) in the product that embeds it.
 */

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

export interface I18nState {
  readonly locale: string;
  readonly fallbackLocale: string;
  /** Registered packs by code — the lookup table `t()` reads. */
  readonly locales: Readonly<Record<string, Locale>>;
  /** Code of a lazy pack currently being fetched (drives switcher spinners). */
  readonly loading: string | null;
}

export type I18nAction =
  /** Switch to a REGISTERED locale. The reducer ignores unregistered codes —
   *  loading a lazy pack goes through LOAD_STARTED (the capability routes). */
  | { type: 'I18N/SET_LOCALE'; locale: string }
  | { type: 'I18N/REGISTER_LOCALE'; locale: Locale }
  | { type: 'I18N/LOAD_STARTED'; locale: string }
  | { type: 'I18N/LOAD_FAILED'; locale: string };

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

export interface I18nCapability {
  /** Translate a key: current locale → fallback locale → `options.fallback` → the key. */
  t(key: string, options?: TranslateOptions): string;
  locale(): string;
  /** Text direction of the CURRENT locale — wire to `dir=` on the shell. */
  dir(): 'ltr' | 'rtl';
  /** Every known locale (registered + lazy), in registration order. */
  locales(): LocaleInfo[];
  /** Code of the lazy pack being fetched right now, if any. */
  loading(): string | null;
  /** Switch locale; fetches the pack first when it's a lazy one. */
  setLocale(code: string): void;
  /** Register a pack at runtime (customer-supplied translations). */
  registerLocale(locale: Locale): void;
}

export const I18nToken = createCapabilityToken<I18nCapability>('i18n');
