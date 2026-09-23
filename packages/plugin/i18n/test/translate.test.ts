import { describe, expect, it } from 'vitest';

import type { I18nState } from '../src/model';
import { interpolate, translate } from '../src/translate';
import { en, es } from './fixtures';

const stateWith = (overrides: Partial<I18nState> = {}): I18nState => ({
  locale: 'es',
  fallbackLocale: 'en',
  locales: { en, es },
  loading: null,
  ...overrides,
});

describe('translate', () => {
  it('resolves a dotted key in the current locale', () => {
    expect(translate(stateWith(), 'commands.save')).toEqual({ text: 'Guardar', found: true });
  });

  it('falls back to the fallback locale for a missing key', () => {
    expect(translate(stateWith(), 'commands.zoom.in')).toEqual({ text: 'Zoom In', found: true });
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
});
