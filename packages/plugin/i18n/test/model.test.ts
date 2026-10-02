import { describe, expect, it } from 'vitest';

import {
  addTranslations,
  endLocaleLoad,
  initialI18nState,
  nestKeys,
  registerLocale,
  seedFromSettings,
  setLocale,
  startLocaleLoad,
  unregisterLocale,
  type I18nState,
} from '../src/model';
import { I18N_DEFAULTS, type I18nSettings } from '../src/contract';
import { ar, en, es } from './fixtures';

const stateWith = (overrides: Partial<I18nState> = {}): I18nState => ({
  locale: 'es',
  locales: { en, es },
  loading: null,
  waitingTranslations: {},
  ...overrides,
});

describe('i18n transitions', () => {
  const settingsWith = (changes: Partial<I18nSettings>): I18nSettings => ({
    ...I18N_DEFAULTS,
    ...changes,
  });

  it('seeds from the settings: their languages loaded, the start language current', () => {
    const state = seedFromSettings(
      initialI18nState(),
      settingsWith({ locales: [en, es], locale: 'es' }),
    );
    expect(state.locale).toBe('es');
    expect(Object.keys(state.locales)).toEqual(['en', 'es']);
    expect(state.loading).toBeNull();
    const fallback = seedFromSettings(initialI18nState(), settingsWith({ locales: [en] }));
    expect(fallback.locale).toBe('en');
  });

  it('shows the fallback language while a start language from loaders loads', () => {
    const state = seedFromSettings(
      initialI18nState(),
      settingsWith({ locales: [en], locale: 'ar', loaders: { ar: async () => ar } }),
    );
    expect(state.locale).toBe('en');
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
    expect(state.locales['ar'].direction).toBe('rtl');
    expect(state.loading).toBeNull();
  });

  it('ends a load only for the code in flight', () => {
    const state = stateWith({ loading: 'ar' });
    expect(endLocaleLoad(state, 'fr')).toBe(state);
    expect(endLocaleLoad(state, 'ar').loading).toBeNull();
  });

  it('unregisters a pack, changing nothing for an unknown code', () => {
    const state = stateWith();
    expect(Object.keys(unregisterLocale(state, 'es').locales)).toEqual(['en']);
    expect(unregisterLocale(state, 'fr')).toBe(state);
  });

  it('merges translations into a registered pack', () => {
    const next = addTranslations(stateWith(), 'es', { commands: { open: 'Abrir' } });
    expect(next.locales['es'].translations).toEqual({
      commands: { save: 'Guardar', open: 'Abrir' },
    });
  });

  it('turns dotted keys into branches, merged in order', () => {
    expect(nestKeys({ 'review.reject': 'Afwijzen', review: { approve: 'Goedkeuren' } })).toEqual({
      review: { reject: 'Afwijzen', approve: 'Goedkeuren' },
    });
    expect(nestKeys({ a: { 'b.c': 'x' } })).toEqual({ a: { b: { c: 'x' } } });
    expect(nestKeys({ 'a.b': 'first', a: { b: 'second' } })).toEqual({ a: { b: 'second' } });
    const plain = { commands: { save: 'Save' } };
    expect(nestKeys(plain)).toBe(plain);
  });

  it('merges dotted keys into a registered pack', () => {
    const next = addTranslations(stateWith(), 'en', { 'commands.zoom.out': 'Zoom Out' });
    expect(next.locales.en.translations.commands).toEqual({
      zoom: { in: 'Zoom In', out: 'Zoom Out' },
      save: 'Save',
    });
  });

  it('registers a pack with dotted keys as branches', () => {
    const state = registerLocale(stateWith(), {
      code: 'nl',
      name: 'Nederlands',
      translations: { 'commands.save': 'Opslaan' },
    });
    expect(state.locales.nl.translations).toEqual({ commands: { save: 'Opslaan' } });
  });

  it('keeps strings for a pack that has not loaded, and merges them on top when it does', () => {
    let state = addTranslations(stateWith(), 'ar', { hi: 'أهلا', 'review.reject': 'رفض' });
    expect(state.locales.ar).toBeUndefined();
    expect(state.waitingTranslations.ar).toEqual({ hi: 'أهلا', review: { reject: 'رفض' } });
    state = registerLocale(state, { ...ar, translations: { hi: 'مرحبا', bye: 'وداعا' } });
    expect(state.locales.ar.translations).toEqual({
      hi: 'أهلا', // the app's string replaces the pack's
      bye: 'وداعا',
      review: { reject: 'رفض' },
    });
    expect(state.waitingTranslations).toEqual({});
  });
});
