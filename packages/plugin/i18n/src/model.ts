/**
 * The i18n slice. Pure and serializable — locale packs are data, so they live
 * HERE, not in a side-table. One source of truth: `t()` is a pure function of
 * this state and reactivity rides the kernel's one change stream.
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

export type I18nAction =
  /** Switch to a REGISTERED locale. The reducer ignores unregistered codes —
   *  loading a lazy pack goes through LOAD_STARTED (the controller routes). */
  | { type: 'I18N/SET_LOCALE'; locale: string }
  | { type: 'I18N/REGISTER_LOCALE'; locale: Locale }
  | { type: 'I18N/UNREGISTER_LOCALE'; locale: string }
  | { type: 'I18N/ADD_TRANSLATIONS'; locale: string; translations: TranslationDictionary }
  | { type: 'I18N/LOAD_STARTED'; locale: string }
  | { type: 'I18N/LOAD_FAILED'; locale: string };

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
  const out: Record<string, string | TranslationDictionary> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    out[key] =
      typeof value === 'object' && typeof current === 'object'
        ? mergeTranslations(current, value)
        : value;
  }
  return out;
}

export function i18nReducer(state: I18nState, action: I18nAction): I18nState {
  switch (action.type) {
    case 'I18N/SET_LOCALE': {
      // Only registered packs can become current — lazy ones arrive via
      // LOAD_STARTED → REGISTER_LOCALE → SET_LOCALE (the loader drives the middle).
      if (!state.locales[action.locale]) return state;
      if (state.locale === action.locale && state.loading === null) return state;
      return { ...state, locale: action.locale, loading: null };
    }
    case 'I18N/REGISTER_LOCALE':
      return { ...state, locales: { ...state.locales, [action.locale.code]: action.locale } };
    case 'I18N/UNREGISTER_LOCALE': {
      if (!state.locales[action.locale]) return state;
      const locales = { ...state.locales };
      delete locales[action.locale];
      return { ...state, locales };
    }
    case 'I18N/ADD_TRANSLATIONS': {
      const pack = state.locales[action.locale];
      if (!pack) return state;
      return {
        ...state,
        locales: {
          ...state.locales,
          [action.locale]: {
            ...pack,
            translations: mergeTranslations(pack.translations, action.translations),
          },
        },
      };
    }
    case 'I18N/LOAD_STARTED':
      return state.loading === action.locale ? state : { ...state, loading: action.locale };
    case 'I18N/LOAD_FAILED':
      return state.loading === action.locale ? { ...state, loading: null } : state;
    default:
      return state;
  }
}
