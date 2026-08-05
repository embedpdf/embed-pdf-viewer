import { describe, expect, it } from 'vitest';
import { negotiateLocale } from './negotiate';
import { i18nReducer, initialI18nState } from './reducer';
import { interpolate, translate } from './translate';
import type { I18nState, Locale } from './types';

const en: Locale = {
  code: 'en',
  name: 'English',
  translations: {
    commands: { zoom: { in: 'Zoom In' }, save: 'Save' },
    zoomLevel: 'Zoom Level ({level}%)',
    pages: { one: '{count} page', other: '{count} pages' },
  },
};
const es: Locale = {
  code: 'es',
  name: 'Español',
  translations: { commands: { save: 'Guardar' } },
};
const ar: Locale = { code: 'ar', name: 'العربية', dir: 'rtl', translations: {} };

const state = (over: Partial<I18nState> = {}): I18nState => ({
  locale: 'es',
  fallbackLocale: 'en',
  locales: { en, es },
  loading: null,
  ...over,
});

describe('translate', () => {
  it('resolves a dotted key in the current locale', () => {
    expect(translate(state(), 'commands.save')).toEqual({ text: 'Guardar', found: true });
  });

  it('falls back to the fallback locale for a missing key', () => {
    expect(translate(state(), 'commands.zoom.in')).toEqual({ text: 'Zoom In', found: true });
  });

  it('uses options.fallback (interpolated) when the key misses every pack', () => {
    expect(
      translate(state(), 'nope.nothing', { fallback: 'Hi {name}', params: { name: 'Bob' } }),
    ).toEqual({ text: 'Hi Bob', found: false });
  });

  it('returns the key itself as a last resort', () => {
    expect(translate(state(), 'nope.nothing')).toEqual({ text: 'nope.nothing', found: false });
  });

  it('interpolates params and leaves unknown slots verbatim', () => {
    expect(translate(state(), 'zoomLevel', { params: { level: 150 } }).text).toBe(
      'Zoom Level (150%)',
    );
    expect(interpolate('{a} {b}', { a: 'x' })).toBe('x {b}');
  });

  it('picks plural branches by count via Intl.PluralRules', () => {
    expect(translate(state(), 'pages', { params: { count: 1 } }).text).toBe('1 page');
    expect(translate(state(), 'pages', { params: { count: 5 } }).text).toBe('5 pages');
    expect(translate(state(), 'pages', { params: { count: 0 } }).text).toBe('0 pages');
  });

  it('does not resolve a branch object without a count', () => {
    expect(translate(state(), 'pages').found).toBe(false);
  });
});

describe('negotiateLocale', () => {
  it('prefers an exact match, case-insensitively', () => {
    expect(negotiateLocale(['en', 'es-MX'], ['ES-mx', 'en'])).toBe('es-MX');
  });

  it('narrows a regional request to its language', () => {
    expect(negotiateLocale(['en', 'es'], ['en-GB'])).toBe('en');
  });

  it('widens to an available dialect of the requested language', () => {
    expect(negotiateLocale(['zh-Hans', 'en'], ['zh'])).toBe('zh-Hans');
  });

  it('respects request preference order across passes', () => {
    // 'de' has no match at all; 'fr-CA' narrows to 'fr'.
    expect(negotiateLocale(['fr', 'en'], ['de', 'fr-CA'])).toBe('fr');
  });

  it('returns null when nothing matches', () => {
    expect(negotiateLocale(['en'], ['ja', 'ko'])).toBeNull();
  });
});

describe('reducer', () => {
  it('seeds from config: eager packs registered, locale defaulted', () => {
    const s = initialI18nState({ locales: [en, es], locale: 'es' });
    expect(s.locale).toBe('es');
    expect(s.fallbackLocale).toBe('en');
    expect(Object.keys(s.locales)).toEqual(['en', 'es']);
    expect(s.loading).toBeNull();
  });

  it('seeds loading when the startup locale is a lazy pack', () => {
    const s = initialI18nState({ locales: [en], locale: 'ar', loaders: { ar: async () => ar } });
    expect(s.locale).toBe('ar'); // t() falls back to en until the pack lands
    expect(s.loading).toBe('ar');
  });

  it('ignores SET_LOCALE for an unregistered pack', () => {
    const s = state();
    expect(i18nReducer(s, { type: 'I18N/SET_LOCALE', locale: 'ar' })).toBe(s);
  });

  it('switches locale and clears loading on SET_LOCALE', () => {
    const s = i18nReducer(state({ loading: 'en' }), { type: 'I18N/SET_LOCALE', locale: 'en' });
    expect(s.locale).toBe('en');
    expect(s.loading).toBeNull();
  });

  it('registers a pack and can then switch to it (the lazy-load sequence)', () => {
    let s = state();
    s = i18nReducer(s, { type: 'I18N/LOAD_STARTED', locale: 'ar' });
    expect(s.loading).toBe('ar');
    s = i18nReducer(s, { type: 'I18N/REGISTER_LOCALE', locale: ar });
    s = i18nReducer(s, { type: 'I18N/SET_LOCALE', locale: 'ar' });
    expect(s.locale).toBe('ar');
    expect(s.locales['ar'].dir).toBe('rtl');
    expect(s.loading).toBeNull();
  });

  it('clears loading on LOAD_FAILED only for the in-flight code', () => {
    const s = state({ loading: 'ar' });
    expect(i18nReducer(s, { type: 'I18N/LOAD_FAILED', locale: 'fr' })).toBe(s);
    expect(i18nReducer(s, { type: 'I18N/LOAD_FAILED', locale: 'ar' }).loading).toBeNull();
  });
});
