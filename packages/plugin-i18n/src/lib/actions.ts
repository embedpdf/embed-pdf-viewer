import { Action } from '@embedpdf/core';
import { Locale, LocaleCode } from './types';

export const SET_LOCALE = 'I18N/SET_LOCALE';
export const REGISTER_LOCALE = 'I18N/REGISTER_LOCALE';

export interface SetLocaleAction extends Action {
  type: typeof SET_LOCALE;
  payload: LocaleCode;
}

export interface RegisterLocaleAction extends Action {
  type: typeof REGISTER_LOCALE;
  payload: LocaleCode;
}

export type I18nAction = SetLocaleAction | RegisterLocaleAction;

export const setLocale = (locale: LocaleCode): SetLocaleAction => ({
  type: SET_LOCALE,
  payload: locale,
});

export const registerLocale = (locale: LocaleCode): RegisterLocaleAction => ({
  type: REGISTER_LOCALE,
  payload: locale,
});
