import { describe, expect, it } from 'vitest';

import {
  addTranslations,
  failLocaleLoad,
  initialI18nState,
  registerLocale,
  setLocale,
  startLocaleLoad,
  unregisterLocale,
  type I18nState,
} from '../src/model';
import { ar, en, es } from './fixtures';

const stateWith = (overrides: Partial<I18nState> = {}): I18nState => ({
  locale: 'es',
  fallbackLocale: 'en',
  locales: { en, es },
  loading: null,
  ...overrides,
});

describe('i18n transitions', () => {
  it('seeds from config: eager packs registered, locale defaulted', () => {
    const state = initialI18nState({ locales: [en, es], locale: 'es' });
    expect(state.locale).toBe('es');
    expect(state.fallbackLocale).toBe('en');
    expect(Object.keys(state.locales)).toEqual(['en', 'es']);
    expect(state.loading).toBeNull();
  });

  it('seeds loading when the startup locale is a lazy pack', () => {
    const state = initialI18nState({
      locales: [en],
      locale: 'ar',
      loaders: { ar: async () => ar },
    });
    expect(state.locale).toBe('ar'); // t() falls back to en until the pack lands
    expect(state.loading).toBe('ar');
  });

  it('ignores setLocale for an unregistered pack', () => {
    const state = stateWith();
    expect(setLocale(state, 'ar')).toBe(state);
  });

  it('switches locale and clears loading on setLocale', () => {
    const next = setLocale(stateWith({ loading: 'en' }), 'en');
    expect(next.locale).toBe('en');
    expect(next.loading).toBeNull();
    expect(setLocale(next, 'en')).toBe(next);
  });

  it('registers a pack and can then switch to it (the lazy-load sequence)', () => {
    let state = startLocaleLoad(stateWith(), 'ar');
    expect(state.loading).toBe('ar');
    expect(startLocaleLoad(state, 'ar')).toBe(state);
    state = registerLocale(state, ar);
    state = setLocale(state, 'ar');
    expect(state.locale).toBe('ar');
    expect(state.locales['ar'].dir).toBe('rtl');
    expect(state.loading).toBeNull();
  });

  it('ends a load on failure only for the code in flight', () => {
    const state = stateWith({ loading: 'ar' });
    expect(failLocaleLoad(state, 'fr')).toBe(state);
    expect(failLocaleLoad(state, 'ar').loading).toBeNull();
  });

  it('unregisters a pack, changing nothing for an unknown code', () => {
    const state = stateWith();
    expect(Object.keys(unregisterLocale(state, 'es').locales)).toEqual(['en']);
    expect(unregisterLocale(state, 'fr')).toBe(state);
  });

  it('merges translations into a registered pack, changing nothing for an unknown code', () => {
    const state = stateWith();
    const next = addTranslations(state, 'es', { commands: { open: 'Abrir' } });
    expect(next.locales['es'].translations).toEqual({
      commands: { save: 'Guardar', open: 'Abrir' },
    });
    expect(addTranslations(state, 'fr', { hi: 'Salut' })).toBe(state);
  });
});
