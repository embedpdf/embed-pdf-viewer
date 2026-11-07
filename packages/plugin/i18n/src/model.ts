/**
 * The i18n state: the current language, the loaded languages' strings, and the
 * language being loaded. Plain data, so `t()` is a pure function of it. Every
 * function below is a pure transition; the controller applies them with
 * `ctx.state.update`.
 */
import type { Locale, TranslationDictionary } from './contract';

export interface I18nModel {
  /** The current language's code. */
  readonly locale: string;
  /** The languages' strings, by code: what `t()` reads. */
  readonly locales: Readonly<Record<string, Locale>>;
  /** The language to show once it and the fallback language have loaded, or `null`. */
  readonly loading: string | null;
  /** The fallback language while its loader runs, or `null`; no language shows before it. */
  readonly loadingFallback: string | null;
  /** The languages whose loader has run, by code. */
  readonly fetched: Readonly<Record<string, true>>;
  /** Strings added to a language before it loaded, by code; they merge in when it does. */
  readonly waitingTranslations: Readonly<Record<string, TranslationDictionary>>;
}

/** Nothing loaded yet: the controller seeds the state from the settings. */
export const initialI18nModel = (): I18nModel => ({
  locale: '',
  locales: {},
  loading: null,
  loadingFallback: null,
  fetched: {},
  waitingTranslations: {},
});

type Loaders = Readonly<Record<string, unknown>>;

/** Whether a language's loader is still to run. A language in `locales` too shows those strings meanwhile. */
export const needsFetch = (state: I18nModel, loaders: Loaders, code: string): boolean =>
  loaders[code] !== undefined && !state.fetched[code];

/** Whether a language has all its strings: it's in, and its loader, if it has one, has run. */
export const isLoaded = (state: I18nModel, loaders: Loaders, code: string): boolean =>
  state.locales[code] !== undefined && !needsFetch(state, loaders, code);

/** Whether a language can show now: it's loaded, and the fallback language isn't on its way. */
export const isReady = (state: I18nModel, loaders: Loaders, code: string): boolean =>
  isLoaded(state, loaders, code) && state.loadingFallback === null;

/** The fallback language waits for its loader when it has one that hasn't run. */
export function followFallback(
  state: I18nModel,
  settings: { readonly fallbackLocale: string; readonly loaders: Loaders },
): I18nModel {
  const { fallbackLocale, loaders } = settings;
  const loadingFallback = needsFetch(state, loaders, fallbackLocale) ? fallbackLocale : null;
  return state.loadingFallback === loadingFallback ? state : { ...state, loadingFallback };
}

/**
 * The state the settings start with: their languages in, the fallback language fetched when it
 * has a loader, and their `locale` current once it can show. Until then `loading` names it, so
 * the loader fetches it once connected, and the fallback language shows, or, while that loads
 * too, the first language in `locales`.
 */
export function seedFromSettings(
  state: I18nModel,
  settings: {
    readonly locale: string | null;
    readonly fallbackLocale: string;
    readonly locales: readonly Locale[];
    readonly loaders: Loaders;
  },
): I18nModel {
  const seeded = followFallback(settings.locales.reduce(registerLocale, state), settings);
  const { fallbackLocale, loaders } = settings;
  const locale = settings.locale ?? fallbackLocale;
  const known = seeded.locales[locale] !== undefined || loaders[locale] !== undefined;
  if (!known || isReady(seeded, loaders, locale)) return { ...seeded, locale };
  const meanwhile =
    seeded.locales[fallbackLocale] !== undefined
      ? fallbackLocale
      : (Object.keys(seeded.locales)[0] ?? fallbackLocale);
  return { ...seeded, locale: meanwhile, loading: locale };
}

/** Deep merge of two dictionaries: later leaves win, branches merge. */
export function mergeTranslations(
  base: TranslationDictionary,
  patch: TranslationDictionary,
): TranslationDictionary {
  const merged: Record<string, string | TranslationDictionary> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = merged[key];
    merged[key] =
      typeof value === 'object' && typeof current === 'object'
        ? mergeTranslations(current, value)
        : value;
  }
  return merged;
}

const hasDottedKey = (dictionary: TranslationDictionary): boolean =>
  Object.entries(dictionary).some(
    ([key, value]) => key.includes('.') || (typeof value === 'object' && hasDottedKey(value)),
  );

/**
 * Dotted keys as branches, the shape `t()` walks: `{ 'review.reject': 'Afwijzen' }` is
 * `{ review: { reject: 'Afwijzen' } }`. Keys merge in order, so a later one wins. A dictionary
 * without a dotted key comes back as it is.
 */
export function nestKeys(dictionary: TranslationDictionary): TranslationDictionary {
  if (!hasDottedKey(dictionary)) return dictionary;
  let nested: TranslationDictionary = {};
  for (const [key, value] of Object.entries(dictionary)) {
    const leaf = typeof value === 'object' ? nestKeys(value) : value;
    const branch = key
      .split('.')
      .reduceRight<string | TranslationDictionary>((inner, part) => ({ [part]: inner }), leaf);
    nested = mergeTranslations(nested, branch as TranslationDictionary);
  }
  return nested;
}

const withNestedKeys = (locale: Locale): Locale => {
  const translations = nestKeys(locale.translations);
  return translations === locale.translations ? locale : { ...locale, translations };
};

/**
 * Switch to a loaded language and end any load. A code that isn't loaded changes nothing: a
 * language in `loaders` becomes current through {@link startLocaleLoad}, {@link registerLocale}
 * and then this transition, which the loader drives.
 */
export function setLocale(state: I18nModel, code: string): I18nModel {
  if (!state.locales[code]) return state;
  if (state.locale === code && state.loading === null) return state;
  return { ...state, locale: code, loading: null };
}

/** Add a language, with any strings that were added to it before it loaded on top. */
export function registerLocale(state: I18nModel, locale: Locale): I18nModel {
  const pack = withNestedKeys(locale);
  const waiting = state.waitingTranslations[locale.code];
  if (!waiting) return { ...state, locales: { ...state.locales, [locale.code]: pack } };
  const { [locale.code]: _merged, ...stillWaiting } = state.waitingTranslations;
  return {
    ...state,
    locales: {
      ...state.locales,
      [locale.code]: { ...pack, translations: mergeTranslations(pack.translations, waiting) },
    },
    waitingTranslations: stillWaiting,
  };
}

/**
 * A language from its loader arrived: it registers in place of any strings the language had, and
 * a wait for it as the fallback language ends.
 */
export function arriveLocale(state: I18nModel, code: string, locale: Locale): I18nModel {
  const registered = registerLocale(state, locale);
  return {
    ...registered,
    fetched: { ...registered.fetched, [code]: true },
    loadingFallback: registered.loadingFallback === code ? null : registered.loadingFallback,
  };
}

export function unregisterLocale(state: I18nModel, code: string): I18nModel {
  if (!state.locales[code]) return state;
  const { [code]: _removed, ...locales } = state.locales;
  const { [code]: _fetched, ...fetched } = state.fetched;
  return { ...state, locales, fetched };
}

/**
 * Merge strings into a language, later keys winning. For a language that isn't loaded yet (one in
 * `loaders`), the strings wait and merge in when it loads; the controller only lets codes with a
 * loader get here.
 */
export function addTranslations(
  state: I18nModel,
  code: string,
  dictionary: TranslationDictionary,
): I18nModel {
  const strings = nestKeys(dictionary);
  const pack = state.locales[code];
  if (!pack) {
    const waiting = state.waitingTranslations[code] ?? {};
    return {
      ...state,
      waitingTranslations: {
        ...state.waitingTranslations,
        [code]: mergeTranslations(waiting, strings),
      },
    };
  }
  return {
    ...state,
    locales: {
      ...state.locales,
      [code]: { ...pack, translations: mergeTranslations(pack.translations, strings) },
    },
  };
}

/** A language in `loaders` is wanted: the loader fetches whatever `loading` names. */
export function startLocaleLoad(state: I18nModel, code: string): I18nModel {
  return state.loading === code ? state : { ...state, loading: code };
}

/** A load ended without switching: it failed or was cancelled. Only the load still wanted ends. */
export function endLocaleLoad(state: I18nModel, code: string): I18nModel {
  return state.loading === code ? { ...state, loading: null } : state;
}

/** The fallback language's loader failed: languages show without it. */
export function endFallbackLoad(state: I18nModel, code: string): I18nModel {
  return state.loadingFallback === code ? { ...state, loadingFallback: null } : state;
}
