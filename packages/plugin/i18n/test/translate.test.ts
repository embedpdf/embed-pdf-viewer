import { describe, expect, it } from 'vitest';

import { interpolate, translate, type TranslationSources } from '../src/translate';
import { en, es } from './fixtures';

const stateWith = (overrides: Partial<TranslationSources> = {}): TranslationSources => ({
  locale: 'es',
  fallbackLocale: 'en',
  locales: { en, es },
  ...overrides,
});

describe('translate', () => {
  it('resolves a dotted key in the current locale', () => {
    expect(translate(stateWith(), 'commands.save')).toEqual({ text: 'Guardar', found: true });
  });

  it('falls back to the fallback locale for a missing key', () => {
    expect(translate(stateWith(), 'zoomLevel')).toEqual({
      text: 'Zoom Level ({level}%)',
      found: true,
    });
  });

  it('uses options.fallback (interpolated) when the key misses every pack', () => {
    expect(
      translate(stateWith(), 'nope.nothing', { fallback: 'Hi {name}', params: { name: 'Bob' } }),
    ).toEqual({ text: 'Hi Bob', found: false });
  });

  it('returns the key itself as a last resort', () => {
    expect(translate(stateWith(), 'nope.nothing')).toEqual({ text: 'nope.nothing', found: false });
  });

  it('interpolates params and leaves unknown slots verbatim', () => {
    expect(translate(stateWith(), 'zoomLevel', { params: { level: 150 } }).text).toBe(
      'Zoom Level (150%)',
    );
    expect(interpolate('{first} {second}', { first: 'x' })).toBe('x {second}');
  });

  it('picks plural branches by count via Intl.PluralRules', () => {
    expect(translate(stateWith(), 'pages', { params: { count: 1 } }).text).toBe('1 page');
    expect(translate(stateWith(), 'pages', { params: { count: 5 } }).text).toBe('5 pages');
    expect(translate(stateWith(), 'pages', { params: { count: 0 } }).text).toBe('0 pages');
  });

  it('does not resolve a branch object without a count', () => {
    expect(translate(stateWith(), 'pages').found).toBe(false);
  });

  it("uses EmbedPDF's own strings under the app's, in the current language first", () => {
    const nl = { code: 'nl-BE', name: 'Nederlands', translations: { hi: 'Hallo' } };
    const sources = stateWith({ locale: 'nl-BE', locales: { en, es, 'nl-BE': nl } });
    expect(translate(sources, 'commands.zoom.out')).toEqual({ text: 'Uitzoomen', found: true });
    // The app's string for the key wins, in any language.
    expect(translate(stateWith({ locale: 'en' }), 'commands.zoom.in').text).toBe('Zoom In');
    // A language EmbedPDF has no strings in falls back to the fallback language's.
    const italian = stateWith({ locale: 'it', locales: { en, es } });
    expect(translate(italian, 'commands.document.print').text).toBe('Print');
  });
});
