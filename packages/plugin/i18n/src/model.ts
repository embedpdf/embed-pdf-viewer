/**
 * The i18n state: the current language, the loaded languages' strings, and the
 * language being loaded. Plain data, so `t()` is a pure function of it. Every
 * function below is a pure transition; the controller applies them with
 * `ctx.state.update`.
 */
import type { Locale, TranslationDictionary } from './contract';

export interface I18nState {
  /** The current language's code. */
  readonly locale: string;
  /** The loaded languages, by code: what `t()` reads. */
  readonly locales: Readonly<Record<string, Locale>>;
  /** The code of a language in `loaders` being fetched, or `null`. */
  readonly loading: string | null;
  /** Strings added to a language before it loaded, by code; they merge in when it does. */
  readonly waitingTranslations: Readonly<Record<string, TranslationDictionary>>;
}

/** Nothing loaded yet: the controller seeds the state from the settings. */
export const initialI18nState = (): I18nState => ({
  locale: '',
  locales: {},
  loading: null,
  waitingTranslations: {},
});

/**
 * The state the settings start with: their languages loaded, and their `locale` current. A start
 * language that is still to load shows `fallbackLocale` meanwhile, and `loading` names it, so the
 * loader fetches it once connected.
 */
export function seedFromSettings(
  state: I18nState,
  settings: {
    readonly locale: string | null;
    readonly fallbackLocale: string;
    readonly locales: readonly Locale[];
    readonly loaders: Readonly<Record<string, unknown>>;
  },
): I18nState {
  const seeded = settings.locales.reduce(registerLocale, state);
  const locale = settings.locale ?? settings.fallbackLocale;
  if (seeded.locales[locale] || settings.loaders[locale] === undefined) {
    return { ...seeded, locale };
  }
  return { ...seeded, locale: settings.fallbackLocale, loading: locale };
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
export function setLocale(state: I18nState, code: string): I18nState {
  if (!state.locales[code]) return state;
  if (state.locale === code && state.loading === null) return state;
  return { ...state, locale: code, loading: null };
}

/** Add a language, with any strings that were added to it before it loaded on top. */
export function registerLocale(state: I18nState, locale: Locale): I18nState {
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

export function unregisterLocale(state: I18nState, code: string): I18nState {
  if (!state.locales[code]) return state;
  const { [code]: _removed, ...locales } = state.locales;
  return { ...state, locales };
}

/**
 * Merge strings into a language, later keys winning. For a language that isn't loaded yet (one in
 * `loaders`), the strings wait and merge in when it loads; the controller only lets codes with a
 * loader get here.
 */
export function addTranslations(
  state: I18nState,
  code: string,
  dictionary: TranslationDictionary,
): I18nState {
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
export function startLocaleLoad(state: I18nState, code: string): I18nState {
  return state.loading === code ? state : { ...state, loading: code };
}

/** A load ended without switching: it failed or was cancelled. Only the load still wanted ends. */
export function endLocaleLoad(state: I18nState, code: string): I18nState {
  return state.loading === code ? { ...state, loading: null } : state;
}
