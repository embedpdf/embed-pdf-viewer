/**
 * The i18n state. Pure and serializable: locale packs are data, so they live
 * in state rather than a side-table, `t()` is a pure function of it, and
 * reactivity rides the kernel's one change stream. Every function below is a
 * pure transition; the controller applies them with `ctx.state.update`.
 */
import type { I18nConfig, Locale, TranslationDictionary } from './contract';

export interface I18nState {
  readonly locale: string;
  readonly fallbackLocale: string;
  /** Registered packs by code — the lookup table `t()` reads. */
  readonly locales: Readonly<Record<string, Locale>>;
  /** Code of a lazy pack currently being fetched (drives switcher spinners). */
  readonly loading: string | null;
  /** Strings added to a lazy pack before it loaded, by code; they merge in when it registers. */
  readonly waitingTranslations: Readonly<Record<string, TranslationDictionary>>;
}

export function initialI18nState(config: I18nConfig): I18nState {
  const fallbackLocale = config.fallbackLocale ?? 'en';
  const locales: Record<string, Locale> = {};
  for (const locale of config.locales ?? []) locales[locale.code] = withNestedKeys(locale);
  const locale = config.locale ?? fallbackLocale;
  // A startup locale that is a lazy pack: show the fallback chain until the
  // pack arrives — seeding `loading` makes the loader fetch it at connect.
  const needsLoad = !locales[locale] && config.loaders?.[locale] !== undefined;
  return {
    locale,
    fallbackLocale,
    locales,
    loading: needsLoad ? locale : null,
    waitingTranslations: {},
  };
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
 * Switch to a registered locale and end any load. Unregistered codes change
 * nothing: a lazy pack becomes current through {@link startLocaleLoad},
 * {@link registerLocale} and then this transition, which the loader drives.
 */
export function setLocale(state: I18nState, code: string): I18nState {
  if (!state.locales[code]) return state;
  if (state.locale === code && state.loading === null) return state;
  return { ...state, locale: code, loading: null };
}

/** Register a pack, with any strings that were added to it before it loaded on top. */
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
 * Merge keys into a pack, later keys winning. For a pack that isn't registered yet (a lazy pack
 * still to load), the strings wait and merge in when it registers; the controller only lets
 * codes with a loader get here.
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

/** A lazy pack is wanted: the loader fetches whatever `loading` names. */
export function startLocaleLoad(state: I18nState, code: string): I18nState {
  return state.loading === code ? state : { ...state, loading: code };
}

/** A lazy pack failed to load; only the load still in flight is ended. */
export function failLocaleLoad(state: I18nState, code: string): I18nState {
  return state.loading === code ? { ...state, loading: null } : state;
}
