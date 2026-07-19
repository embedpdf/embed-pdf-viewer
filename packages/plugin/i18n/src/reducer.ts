import type { I18nAction, I18nConfig, I18nState, Locale } from './types';

/**
 * Pure and serializable — locale packs are data, so they live HERE, not in a
 * side-table. One source of truth: `t()` is a pure function of this state and
 * reactivity rides the kernel's one change stream (no emitters).
 */

export function initialI18nState(config: I18nConfig): I18nState {
  const fallbackLocale = config.fallbackLocale ?? 'en';
  const locales: Record<string, Locale> = {};
  for (const locale of config.locales ?? []) locales[locale.code] = locale;
  const locale = config.locale ?? fallbackLocale;
  // A startup locale that is a lazy pack: show the fallback chain until the
  // pack arrives — seeding `loading` makes effects fetch it at startup.
  const needsLoad = !locales[locale] && config.loaders?.[locale] !== undefined;
  return { locale, fallbackLocale, locales, loading: needsLoad ? locale : null };
}

export function i18nReducer(state: I18nState, action: I18nAction): I18nState {
  switch (action.type) {
    case 'I18N/SET_LOCALE': {
      // Only registered packs can become current — lazy ones arrive via
      // LOAD_STARTED → REGISTER_LOCALE → SET_LOCALE (effects drive the middle).
      if (!state.locales[action.locale]) return state;
      if (state.locale === action.locale && state.loading === null) return state;
      return { ...state, locale: action.locale, loading: null };
    }
    case 'I18N/REGISTER_LOCALE':
      return { ...state, locales: { ...state.locales, [action.locale.code]: action.locale } };
    case 'I18N/LOAD_STARTED':
      return state.loading === action.locale ? state : { ...state, loading: action.locale };
    case 'I18N/LOAD_FAILED':
      return state.loading === action.locale ? { ...state, loading: null } : state;
    default:
      return state;
  }
}
