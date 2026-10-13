/**
 * The viewer's languages: every pack has exactly the English pack's keys, with the same `{name}`
 * slots in each string; Arabic and Hebrew read right to left; and the app's `strings` change a
 * language, or add one that reads the way its code says.
 */
import { describe, expect, it } from 'vitest';

import type { Locale, TranslationDictionary } from '@embedpdf/plugin-i18n';

import {
  LOCALE_LOADERS,
  directionOf,
  en,
  localeCodeOf,
  localesOf,
} from '../../../chrome/src/locales';

/** Every string of a dictionary, by its dotted key. */
function stringsOf(dictionary: TranslationDictionary, prefix = ''): Map<string, string> {
  const strings = new Map<string, string>();
  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof value === 'string') strings.set(`${prefix}${key}`, value);
    else for (const entry of stringsOf(value, `${prefix}${key}.`)) strings.set(...entry);
  }
  return strings;
}

/** The `{name}` slots of a string, sorted. */
const slotsOf = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();

/** The thirteen languages the Translations page lists. */
const LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'ja', 'zh-CN', 'ko', 'ar', 'he'];
const RIGHT_TO_LEFT = ['ar', 'he'];

const packs = async (): Promise<Locale[]> => [
  en,
  ...(await Promise.all(Object.values(LOCALE_LOADERS).map((load) => load()))),
];

describe('the language packs', () => {
  it('are the thirteen languages, English loaded from the start and each other one when shown', async () => {
    expect(['en', ...Object.keys(LOCALE_LOADERS)].sort()).toEqual([...LANGUAGES].sort());
    const loaded = await packs();
    expect(loaded.map((pack) => pack.code).sort()).toEqual([...LANGUAGES].sort());
    for (const [code, load] of Object.entries(LOCALE_LOADERS)) {
      expect((await load()).code).toBe(code);
    }
  });

  it('each have exactly the English keys, with the same slots in every string', async () => {
    const english = stringsOf(en.translations);
    for (const pack of await packs()) {
      const strings = stringsOf(pack.translations);
      expect({ code: pack.code, keys: [...strings.keys()].sort() }).toEqual({
        code: pack.code,
        keys: [...english.keys()].sort(),
      });
      for (const [key, text] of strings) {
        expect({ code: pack.code, key, slots: slotsOf(text) }).toEqual({
          code: pack.code,
          key,
          slots: slotsOf(english.get(key)!),
        });
        expect({ code: pack.code, key, empty: text.trim() === '' }).toEqual({
          code: pack.code,
          key,
          empty: false,
        });
      }
    }
  });

  it('name each language in itself, and read right to left in Arabic and Hebrew only', async () => {
    for (const pack of await packs()) {
      expect(pack.name).not.toBe(pack.code);
      expect({ code: pack.code, direction: pack.direction ?? 'ltr' }).toEqual({
        code: pack.code,
        direction: RIGHT_TO_LEFT.includes(pack.code) ? 'rtl' : 'ltr',
      });
    }
  });
});

describe('directionOf', () => {
  it('reads right to left for a code whose script does', () => {
    expect(directionOf('fa')).toBe('rtl');
    expect(directionOf('ur-PK')).toBe('rtl');
    expect(directionOf('yi')).toBe('rtl');
    expect(directionOf('ku-Arab')).toBe('rtl');
    expect(directionOf('und-Hebr')).toBe('rtl');
  });

  it('reads left to right otherwise, and for a code the browser cannot read', () => {
    expect(directionOf('sv')).toBe('ltr');
    expect(directionOf('ku')).toBe('ltr');
    expect(directionOf('not a language')).toBe('ltr');
  });
});

describe('localesOf', () => {
  it('adds the strings of one of the viewer languages to it when it loads, in any case', async () => {
    const { locales, loaders, codes } = localesOf({
      'zh-cn': { 'document:download': '另存一份' },
      ar: { commands: { print: 'اطبع' } },
    });
    expect(locales.map((locale) => locale.code)).toEqual(['en']);
    expect(codes).toEqual(['en', ...Object.keys(LOCALE_LOADERS)]);
    const chinese = await loaders['zh-CN']!();
    expect(stringsOf(chinese.translations).get('document:download')).toBe('另存一份');
    const arabic = await loaders.ar!();
    expect(arabic.direction).toBe('rtl');
    expect(stringsOf(arabic.translations).get('commands.print')).toBe('اطبع');
    // The rest of the pack stays.
    expect(stringsOf(arabic.translations).get('commands.undo')).toBe(
      stringsOf((await LOCALE_LOADERS.ar!()).translations).get('commands.undo'),
    );
  });

  it('makes a language of its own from strings for any other code, reading as its code says', () => {
    const { locales, codes } = localesOf({
      sv: { 'zoom:in': 'Zooma in', 'acme.send': 'Skicka' },
      fa: { 'zoom:in': 'بزرگ‌نمایی' },
    });
    const swedish = locales.find((locale) => locale.code === 'sv')!;
    expect(swedish.direction).toBe('ltr');
    expect(swedish.translations).toEqual({ 'zoom:in': 'Zooma in', acme: { send: 'Skicka' } });
    expect(swedish.name.toLowerCase()).toBe('svenska');
    expect(locales.find((locale) => locale.code === 'fa')!.direction).toBe('rtl');
    expect(codes.slice(-2)).toEqual(['sv', 'fa']);
    expect(localeCodeOf('sv-FI', codes)).toBe('sv');
    expect(localeCodeOf('ar-EG', codes)).toBe('ar');
    expect(localeCodeOf('zh-Hans', codes)).toBe('zh-CN');
    expect(localeCodeOf('pt-BR', codes)).toBe('pt');
    expect(localeCodeOf('tlh', codes)).toBe('en');
  });

  it('changes English in place', () => {
    const { locales } = localesOf({ en: { 'document:download': 'Save a copy' } });
    expect(stringsOf(locales[0]!.translations).get('document:download')).toBe('Save a copy');
    expect(stringsOf(locales[0]!.translations).get('commands.download')).toBe('Download');
  });
});
