import { Reducer } from '@embedpdf/core';
import { I18nState } from './types';
import { I18nAction, SET_LOCALE, REGISTER_LOCALE } from './actions';

export const initialState: I18nState = {
  currentLocale: 'en',
  availableLocales: [],
};

export const i18nReducer: Reducer<I18nState, I18nAction> = (state = initialState, action) => {
  switch (action.type) {
    case SET_LOCALE: {
      const locale = action.payload;
      if (!state.availableLocales.includes(locale)) {
        console.warn(`I18nPlugin: Locale '${locale}' not available`);
        return state;
      }
      return {
        ...state,
        currentLocale: locale,
      };
    }

    case REGISTER_LOCALE: {
      const locale = action.payload;
      if (state.availableLocales.includes(locale)) {
        return state; // Already registered
      }
      return {
        ...state,
        availableLocales: [...state.availableLocales, locale],
      };
    }

    default:
      return state;
  }
};
