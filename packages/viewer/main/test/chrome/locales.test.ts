/**
 * The viewer's languages: every pack has exactly the English pack's keys, with the same `{name}`
 * slots in each string, and each count's plural forms as its language has them; the English pack names the style panel's properties and options as the
 * annotation kinds do; Arabic and Hebrew read right to left; readers of Traditional Chinese get
 * the Traditional pack, never Simplified; and the app's `strings` change a language, or add one
 * that reads the way its code says. The keys the Translations page names are the English pack's.
 * Dates, times and numbers are written in the language shown, in the region of the reader.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { KINDS, propertiesOf } from '@embedpdf/core-annotation';
import type { Locale, TranslationDictionary } from '@embedpdf/plugin-i18n';

import {
  LOCALE_LOADERS,
  directionOf,
  en,
  fallbackCodeOf,
  formatLocaleOf,
  localeCodeOf,
  localesOf,
  readerLanguagesOf,
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

const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

/** Whether a branch is a count's plural forms: only plural form names, `other` among them. */
const isPlural = (branch: TranslationDictionary): boolean =>
  'other' in branch && Object.keys(branch).every((key) => PLURAL_FORMS.has(key));

/** Every string of a dictionary by its dotted key, a count's plural forms as one entry. */
function entriesOf(
  dictionary: TranslationDictionary,
  prefix = '',
): Map<string, string | TranslationDictionary> {
  const entries = new Map<string, string | TranslationDictionary>();
  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof value === 'string' || isPlural(value)) entries.set(`${prefix}${key}`, value);
    else for (const entry of entriesOf(value, `${prefix}${key}.`)) entries.set(...entry);
  }
  return entries;
}

/** The plural forms a language has, as `Intl.PluralRules` says: `one` and `other` in English. */
const pluralFormsOf = (code: string): string[] =>
  [...new Intl.PluralRules(code).resolvedOptions().pluralCategories].sort();

/** The fifteen languages the Translations page lists. */
const LANGUAGES = [
  'en',
  'de',
  'fr',
  'es',
  'it',
  'nl',
  'pt',
  'pl',
  'sv',
  'ja',
  'zh-CN',
  'zh-TW',
  'ko',
  'ar',
  'he',
];
const RIGHT_TO_LEFT = ['ar', 'he'];

const packs = async (): Promise<Locale[]> => [
  en,
  ...(await Promise.all(Object.values(LOCALE_LOADERS).map((load) => load()))),
];

describe('the language packs', () => {
  it('are the fifteen languages, English loaded from the start and each other one when shown', async () => {
    expect(['en', ...Object.keys(LOCALE_LOADERS)].sort()).toEqual([...LANGUAGES].sort());
    const loaded = await packs();
    expect(loaded.map((pack) => pack.code).sort()).toEqual([...LANGUAGES].sort());
    for (const [code, load] of Object.entries(LOCALE_LOADERS)) {
      expect((await load()).code).toBe(code);
    }
  });

  it('each have exactly the English keys, with the same slots in every string', async () => {
    const english = entriesOf(en.translations);
    for (const pack of await packs()) {
      const { code } = pack;
      const entries = entriesOf(pack.translations);
      expect({ code, keys: [...entries.keys()].sort() }).toEqual({
        code,
        keys: [...english.keys()].sort(),
      });
      for (const [key, value] of entries) {
        const source = english.get(key)!;
        const kind = (entry: string | TranslationDictionary) =>
          typeof entry === 'string' ? 'a string' : 'plural forms';
        expect({ code, key, kind: kind(value) }).toEqual({ code, key, kind: kind(source) });
        if (typeof value === 'string' && typeof source === 'string') {
          expect({ code, key, slots: slotsOf(value) }).toEqual({
            code,
            key,
            slots: slotsOf(source),
          });
          expect({ code, key, empty: value.trim() === '' }).toEqual({ code, key, empty: false });
        }
      }
    }
  });

  it("give each count the plural forms of their language, `other` with English's slots", async () => {
    const english = entriesOf(en.translations);
    const plurals = [...english].filter(
      (entry): entry is [string, TranslationDictionary] => typeof entry[1] !== 'string',
    );
    expect(plurals.map(([key]) => key).sort()).toEqual([
      'attachments.count',
      'commands.redact.apply',
      'comments.count',
      'demo.redactConfirmBody',
      'demo.redactConfirmCollateral',
      'demo.redactConfirmTitle',
      'demo.searchResults',
      'stylePanel.selected',
    ]);
    for (const pack of await packs()) {
      const { code } = pack;
      const entries = entriesOf(pack.translations);
      for (const [key, source] of plurals) {
        const forms = entries.get(key) as Readonly<Record<string, string>>;
        const slots = slotsOf(source['other'] as string);
        expect({ code, key, forms: Object.keys(forms).sort() }).toEqual({
          code,
          key,
          forms: pluralFormsOf(code),
        });
        // `other` says the number; a form for one or two may say it in words instead.
        expect({ code, key, other: slotsOf(forms['other']!) }).toEqual({ code, key, other: slots });
        for (const [form, text] of Object.entries(forms)) {
          expect({
            code,
            key,
            form,
            extra: slotsOf(text).filter((s) => !slots.includes(s)),
          }).toEqual({ code, key, form, extra: [] });
          expect({ code, key, form, empty: text.trim() === '' }).toEqual({
            code,
            key,
            form,
            empty: false,
          });
        }
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

describe('the keys the Translations page names', () => {
  it('are in the English pack', () => {
    const page = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../../docs/content/viewer/customize/translations.mdx',
      ),
      'utf8',
    );
    const english = stringsOf(en.translations);
    const named = [...page.matchAll(/`((?:pageNumber|comments|annotation|form)\.[\w.]+)`/g)].map(
      (match) => match[1]!,
    );
    expect(named).toEqual(expect.arrayContaining(['pageNumber.page', 'comments.empty']));
    expect(named.filter((key) => !english.has(key))).toEqual([]);
  });
});

describe('the style labels', () => {
  it('are in the English pack under their keys, as the annotation kinds say them', () => {
    const english = stringsOf(en.translations);
    const differing: string[] = [];
    for (const kind of Object.values(KINDS)) {
      for (const property of propertiesOf(kind)) {
        const labels = [property, ...('options' in property ? property.options : [])];
        for (const { label, labelKey } of labels) {
          if (english.get(labelKey) !== label) {
            differing.push(
              `${kind.name}: ${labelKey} is "${english.get(labelKey)}", not "${label}"`,
            );
          }
        }
      }
    }
    expect(differing).toEqual([]);
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
      da: { 'zoom:in': 'Zoom ind', 'acme.send': 'Send' },
      fa: { 'zoom:in': 'بزرگ‌نمایی' },
    });
    const danish = locales.find((locale) => locale.code === 'da')!;
    expect(danish.direction).toBe('ltr');
    expect(danish.translations).toEqual({ 'zoom:in': 'Zoom ind', acme: { send: 'Send' } });
    expect(danish.name.toLowerCase()).toBe('dansk');
    expect(locales.find((locale) => locale.code === 'fa')!.direction).toBe('rtl');
    expect(codes.slice(-2)).toEqual(['da', 'fa']);
    expect(localeCodeOf('da-GL', codes)).toBe('da');
    expect(localeCodeOf('sv-FI', codes)).toBe('sv');
    expect(localeCodeOf('ar-EG', codes)).toBe('ar');
    expect(localeCodeOf('zh-Hans', codes)).toBe('zh-CN');
    expect(localeCodeOf('pt-BR', codes)).toBe('pt');
    expect(localeCodeOf('tlh', codes)).toBe('en');
  });

  it('shows Traditional Chinese to its readers, and Simplified only to readers of Simplified', () => {
    const { codes } = localesOf();
    expect(localeCodeOf('zh-TW', codes)).toBe('zh-TW');
    expect(localeCodeOf('zh-HK', codes)).toBe('zh-TW');
    expect(localeCodeOf('zh-MO', codes)).toBe('zh-TW');
    expect(localeCodeOf('zh-Hant', codes)).toBe('zh-TW');
    expect(localeCodeOf('zh', codes)).toBe('zh-CN');
    expect(localeCodeOf('zh-SG', codes)).toBe('zh-CN');
    expect(localeCodeOf('zh-Hans-HK', codes)).toBe('zh-CN');
  });

  it('changes English in place', () => {
    const { locales } = localesOf({ en: { 'document:download': 'Save a copy' } });
    expect(stringsOf(locales[0]!.translations).get('document:download')).toBe('Save a copy');
    expect(stringsOf(locales[0]!.translations).get('commands.download')).toBe('Download');
  });

  it('loads words given as a function with their language, from a module or as they are', async () => {
    let loads = 0;
    const { locales, loaders, codes } = localesOf({
      sv: () => {
        loads++;
        return Promise.resolve({ default: { 'acme.send': 'Skicka för signering' } });
      },
      da: () => Promise.resolve({ 'acme.send': 'Send til underskrift' }),
      'zh-cn': { 'zoom:in': '放大' },
      'zh-CN': () => Promise.resolve({ 'zoom:in': '放大一点' }),
    });
    expect(loads).toBe(0); // nothing loads before the language is needed
    expect(locales.map((locale) => locale.code)).toEqual(['en']);
    expect(codes.slice(-1)).toEqual(['da']);

    const swedish = await loaders.sv!();
    expect(loads).toBe(1);
    expect(stringsOf(swedish.translations).get('acme.send')).toBe('Skicka för signering');
    expect(stringsOf(swedish.translations).get('commands.undo')).toBe(
      stringsOf((await LOCALE_LOADERS.sv!()).translations).get('commands.undo'),
    );

    const danish = await loaders.da!();
    expect(danish).toMatchObject({ code: 'da', direction: 'ltr' });
    expect(danish.name.toLowerCase()).toBe('dansk');
    expect(danish.translations).toEqual({ acme: { send: 'Send til underskrift' } });

    // Words and a function for one language merge in the order given.
    const chinese = await loaders['zh-CN']!();
    expect(stringsOf(chinese.translations).get('zoom:in')).toBe('放大一点');
  });

  it('keeps English in every build, and loads your English words given as a function', async () => {
    const { locales, loaders } = localesOf({
      en: () => Promise.resolve({ 'acme.send': 'Send for signature' }),
    });
    expect(locales[0]).toBe(en); // shows meanwhile
    const english = await loaders.en!();
    expect(stringsOf(english.translations).get('acme.send')).toBe('Send for signature');
    expect(stringsOf(english.translations).get('commands.download')).toBe('Download');
  });
});

describe('fallbackCodeOf', () => {
  it('finds the fallback language among the languages, English without one, null for none', () => {
    const { codes } = localesOf({ da: { 'zoom:in': 'Zoom ind' } });
    expect(fallbackCodeOf(undefined, codes)).toBe('en');
    expect(fallbackCodeOf('sv', codes)).toBe('sv');
    expect(fallbackCodeOf('sv-SE', codes)).toBe('sv');
    expect(fallbackCodeOf('DA', codes)).toBe('da');
    expect(fallbackCodeOf('fi', codes)).toBeNull();
    // A browser language the viewer has no language for shows the fallback language.
    expect(localeCodeOf('fi', codes, 'sv')).toBe('sv');
  });
});

describe('formatLocaleOf', () => {
  const { codes } = localesOf();

  it("writes in the reader's region of the language shown", () => {
    expect(formatLocaleOf('en', codes, ['en-GB', 'en'])).toBe('en-GB');
    expect(formatLocaleOf('de', codes, ['de-CH'])).toBe('de-CH');
    expect(formatLocaleOf('pt', codes, ['pt-BR'])).toBe('pt-BR');
    expect(formatLocaleOf('zh-TW', codes, ['zh-HK'])).toBe('zh-HK');
    // A language without a region says nothing about where its reader is: the next one does.
    expect(formatLocaleOf('en', codes, ['en', 'en-AU', 'en-GB'])).toBe('en-AU');
    expect(formatLocaleOf('en', codes, ['en-gb'])).toBe('en-GB');
  });

  it('never writes in another language than the one shown', () => {
    expect(formatLocaleOf('en', codes, ['de-CH', 'fr-FR'])).toBe('en');
    expect(formatLocaleOf('de', codes, ['en-US', 'de-AT'])).toBe('de-AT');
    expect(formatLocaleOf('en', codes, [])).toBe('en');
    // Simplified Chinese stays Simplified for a reader of Traditional.
    expect(formatLocaleOf('zh-CN', codes, ['zh-TW'])).toBe('zh-CN');
    // The fallback language, for a reader the viewer has no language for.
    expect(formatLocaleOf('en', codes, ['fi-FI'])).toBe('en');
  });

  it("keeps the region of a language that names one, whatever the reader's", () => {
    const withBritish = localesOf({ 'en-GB': { 'zoom:in': 'Zoom in' } }).codes;
    expect(formatLocaleOf('en-GB', withBritish, ['en-US'])).toBe('en-GB');
    expect(formatLocaleOf('en-GB', withBritish, ['en-GB', 'en-US'])).toBe('en-GB');
    expect(formatLocaleOf('en', withBritish, ['en-US'])).toBe('en-US');
  });

  it("is the browser's own formats for a language whose code the browser can't read", () => {
    const withOdd = localesOf({ en_US: { 'zoom:in': 'Zoom in' } }).codes;
    const formatLocale = formatLocaleOf('en_US', withOdd, ['en-GB']);
    expect(formatLocale).toBeUndefined();
    expect(() => new Intl.DateTimeFormat('en_US')).toThrow(RangeError);
    expect(() => new Intl.DateTimeFormat(formatLocale)).not.toThrow();
  });
});

describe('readerLanguagesOf', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is the browser's languages for 'auto', after the language the app asks for", () => {
    vi.stubGlobal('navigator', { languages: ['de-CH', 'de'] });
    expect(readerLanguagesOf('auto')).toEqual(['de-CH', 'de']);
    expect(readerLanguagesOf('en-GB')).toEqual(['en-GB', 'de-CH', 'de']);
  });
});
