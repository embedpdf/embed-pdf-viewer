/**
 * @embedpdf/plugin-i18n/contract — translations and the current language.
 *
 * Languages are data: the packs live in the plugin's state, so `t()` is a pure
 * read and every reader follows the kernel's one change stream. The plugin is
 * workspace-scoped and needs no engine or document, so it translates a loading
 * screen and a password prompt too. It ships EmbedPDF's own strings (the
 * standard commands' labels) in eight languages, under the app's.
 */
import type {
  DeepPartial,
  EventHook,
  OperationOptions,
  PluginErrorInfo,
  SettingsApi,
  Unsubscribe,
} from '@embedpdf/core';

export { I18nToken } from './token';

/**
 * A tree of strings. A leaf may hold `{name}` slots. A dotted key is the same as a nested one:
 * `{ 'review.reject': 'Reject' }` is `{ review: { reject: 'Reject' } }`.
 */
export interface TranslationDictionary {
  readonly [key: string]: string | TranslationDictionary;
}

/** How a language reads. */
export type TextDirection = 'ltr' | 'rtl';

/** A language and its strings. */
export interface Locale {
  /** Its language tag (RFC 5646): `'en'`, `'nl'`, `'ar'`, `'zh-CN'`. */
  readonly code: string;
  /** Its name in itself, as a language picker shows it: `'Nederlands'`. */
  readonly name: string;
  /** How it reads; `'ltr'` when left out. */
  readonly direction?: TextDirection;
  readonly translations: TranslationDictionary;
}

/** Loads a language the first time someone switches to it. */
export type LocaleLoader = () => Promise<Locale>;

/**
 * The i18n plugin's settings. `i18nPlugin(config)` registers them over
 * {@link I18N_DEFAULTS}, and `updateSettings()` changes them while the app runs: a new `locale`
 * switches to it, new `locales` are registered, and `fallbackLocale` and `loaders` apply to the
 * next lookup and the next switch.
 */
export interface I18nSettings {
  /**
   * The language to start with; `null` starts with `fallbackLocale`. Pick it outside the plugin,
   * which never reads the browser: `negotiateLocale(codes, navigator.languages)`. A language in
   * `loaders` shows the fallback language until it has loaded.
   */
  readonly locale: string | null;
  /** The language to use for a string another language doesn't have. */
  readonly fallbackLocale: string;
  /** Languages loaded from the start. */
  readonly locales: readonly Locale[];
  /**
   * Languages loaded the first time someone switches to them, by code. Until then a language
   * picker shows the code as the name.
   */
  readonly loaders: Readonly<Record<string, LocaleLoader>>;
}

const NO_LOCALES: readonly Locale[] = [];
const NO_LOADERS: Readonly<Record<string, LocaleLoader>> = {};

/** What the i18n settings are when the app registers none. */
export const I18N_DEFAULTS: I18nSettings = {
  locale: null,
  fallbackLocale: 'en',
  locales: NO_LOCALES,
  loaders: NO_LOADERS,
};

/** What `i18nPlugin(config)` takes: any of the settings, merged over the defaults. */
export type I18nConfig = DeepPartial<I18nSettings>;

export interface TranslateOptions {
  /**
   * The values of the string's `{name}` slots. A number `count` also picks the plural: a key
   * whose string is `{ one, other }` gives the form for the language's plural rule
   * (`Intl.PluralRules`), and `other` when the rule's form is missing.
   *
   * ```ts
   * // pages: { one: '{count} page', other: '{count} pages' }
   * t('pages', { params: { count: 1 } }) // '1 page'
   * ```
   */
  params?: Record<string, string | number>;
  /** What to show, with its slots filled, when no language has the key; the key itself otherwise. */
  fallback?: string;
}

/** A language as a picker shows it: the loaded ones and the ones in `loaders`. */
export interface LocaleInfo {
  readonly code: string;
  /** Its name in itself; the code until a language in `loaders` has loaded. */
  readonly name: string;
  readonly direction: TextDirection;
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

export interface I18nCapability extends SettingsApi<I18nSettings> {
  /**
   * A string in the current language, with `params` filled in: the app's strings for the
   * language, then EmbedPDF's own, then the same for the fallback language, then
   * `options.fallback`, then the key. A key no language has warns once in the console.
   */
  t(key: string, options?: TranslateOptions): string;
  /**
   * A `t` function that stays the same until the language or the strings change, so a memoized
   * component holding it renders again exactly when its strings may differ.
   */
  getTranslator(): (key: string, options?: TranslateOptions) => string;
  /** Whether a key has a string in the current or the fallback language. Never warns. */
  hasKey(key: string): boolean;
  /** The current language's code. */
  getLocale(): string;
  /** How the current language reads: set it as `dir` on your viewer's root. */
  getDirection(): TextDirection;
  /** Every language you can switch to, loaded or not, in the order they were added. The same array until one changes. */
  listLocales(): readonly LocaleInfo[];
  /** The code of the language being loaded, or `null`. */
  getLoadingLocale(): string | null;
  /**
   * Switch the language, loading it first when it's in `loaders`. Resolves once it shows, and
   * fires `onLocaleChanged`. Rejects `not-found` for a code that is neither loaded nor in
   * `loaders`, `operation-failed` when it can't load (and fires `onLocaleLoadFailed`), and
   * `operation-cancelled` when the signal fires or a newer call replaces it.
   */
  setLocale(code: string, options?: OperationOptions): Promise<void>;
  /** Add a whole language, and get a function that removes it again. */
  registerLocale(locale: Locale): Unsubscribe;
  /**
   * Add strings to a language, loaded or not, replacing the ones with the same key; dotted keys
   * work. A language in `loaders` gets them when it loads, on top of its own. Throws `not-found`
   * for a code that is neither loaded nor in `loaders`.
   */
  addTranslations(code: string, translations: TranslationDictionary): void;
  /** The current language changed and shows; never while a language is still loading. */
  readonly onLocaleChanged: EventHook<LocaleChangedEvent>;
  /** A language in `loaders` couldn't be loaded; the current language stays. */
  readonly onLocaleLoadFailed: EventHook<LocaleLoadFailedEvent>;
}
