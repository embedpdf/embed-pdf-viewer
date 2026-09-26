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
}

export function initialI18nState(config: I18nConfig): I18nState {
  const fallbackLocale = config.fallbackLocale ?? 'en';
  const locales: Record<string, Locale> = {};
  for (const locale of config.locales ?? []) locales[locale.code] = locale;
  const locale = config.locale ?? fallbackLocale;
  // A startup locale that is a lazy pack: show the fallback chain until the
  // pack arrives — seeding `loading` makes the loader fetch it at connect.
  const needsLoad = !locales[locale] && config.loaders?.[locale] !== undefined;
  return { locale, fallbackLocale, locales, loading: needsLoad ? locale : null };
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

export function registerLocale(state: I18nState, locale: Locale): I18nState {
  return { ...state, locales: { ...state.locales, [locale.code]: locale } };
}

export function unregisterLocale(state: I18nState, code: string): I18nState {
  if (!state.locales[code]) return state;
  const { [code]: _removed, ...locales } = state.locales;
  return { ...state, locales };
}

/** Merge keys into a registered pack; an unknown code changes nothing. */
export function addTranslations(
  state: I18nState,
  code: string,
  dictionary: TranslationDictionary,
): I18nState {
  const pack = state.locales[code];
  if (!pack) return state;
  return {
    ...state,
    locales: {
      ...state.locales,
      [code]: { ...pack, translations: mergeTranslations(pack.translations, dictionary) },
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
