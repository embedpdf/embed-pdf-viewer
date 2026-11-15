/**
 * The viewer's languages: English in every build, the others each in a chunk of its own that
 * loads the first time the viewer shows it, and the languages an app adds or changes through
 * `strings`, given as words or as a function that loads them. A language reads right to left when
 * its pack says so (Arabic, Hebrew), or, for a language from `strings`, when its code names a
 * right-to-left script (`fa`, `ur`, `und-Arab`).
 */
import { negotiateLocale } from '@embedpdf/react/i18n';
import type { Locale, TextDirection, TranslationDictionary } from '@embedpdf/react/i18n';

import { en } from './en';

export { en };

/** A language that loads when it's first shown. */
export type LocalePackLoader = () => Promise<Locale>;

/**
 * A language's words, loaded the first time the viewer needs them: a function that resolves to
 * the words, or to a module whose `default` export is the words, such as `() => import('./sv.json')`.
 */
export type StringsLoader = () => Promise<
  TranslationDictionary | { readonly default: TranslationDictionary }
>;

/** A language's words in `strings`: the words, or a function that loads them. */
export type LanguageStrings = TranslationDictionary | StringsLoader;

/** The viewer's languages besides English, by code. */
export const LOCALE_LOADERS: Readonly<Record<string, LocalePackLoader>> = {
  de: () => import('./de').then((module) => module.de),
  fr: () => import('./fr').then((module) => module.fr),
  es: () => import('./es').then((module) => module.es),
  it: () => import('./it').then((module) => module.it),
  nl: () => import('./nl').then((module) => module.nl),
  pt: () => import('./pt').then((module) => module.pt),
  pl: () => import('./pl').then((module) => module.pl),
  sv: () => import('./sv').then((module) => module.sv),
  ja: () => import('./ja').then((module) => module.ja),
  'zh-CN': () => import('./zh-cn').then((module) => module.zhCN),
  'zh-TW': () => import('./zh-tw').then((module) => module.zhTW),
  ko: () => import('./ko').then((module) => module.ko),
  ar: () => import('./ar').then((module) => module.ar),
  he: () => import('./he').then((module) => module.he),
};

/** The browser's languages, the one its user wants most first; none outside a browser. */
const browserLanguages = (): readonly string[] =>
  typeof navigator !== 'undefined' ? (navigator.languages ?? []) : [];

/**
 * The language a `locale` value shows, among `codes`: the browser's languages for `'auto'`,
 * else the closest to the one asked for (`'es-MX'` shows `'es'`), else the fallback language.
 */
export const localeCodeOf = (
  locale: string,
  codes: readonly string[],
  fallback: string = 'en',
): string => negotiateLocale(codes, locale !== 'auto' ? [locale] : browserLanguages()) ?? fallback;

/**
 * The language tags that say where the viewer's reader is, the most telling first: the `locale`
 * value when it names a language (`'en-GB'`), then the browser's languages.
 */
export const readerLanguagesOf = (locale: string): readonly string[] => [
  ...(locale !== 'auto' ? [locale] : []),
  ...browserLanguages(),
];

/** The region a language tag names (`GB` in `en-GB`); `undefined` for none, and for no tag at all. */
function regionOf(tag: string): string | undefined {
  try {
    return new Intl.Locale(tag).region;
  } catch {
    return undefined;
  }
}

/**
 * The language tag the viewer writes dates, times and numbers in: the language it shows, in the
 * region of its reader. Of the reader's languages (`readerLanguagesOf`), that's the first one
 * that names a region and that `shown` is the viewer's language for, among `codes`: English
 * reads `14 Sept, 17:30` for `en-GB` and `Sep 14, 5:30 PM` for `en-US`, and no reader of German
 * turns an English viewer's dates German. Without one it's `shown` itself, and `undefined` (the
 * browser's own formats) when `shown` isn't a tag the browser can read.
 */
export function formatLocaleOf(
  shown: string,
  codes: readonly string[],
  readerLanguages: readonly string[],
): string | undefined {
  const regional = readerLanguages.find(
    (tag) => regionOf(tag) !== undefined && negotiateLocale(codes, [tag]) === shown,
  );
  try {
    return Intl.getCanonicalLocales(regional ?? shown)[0];
  } catch {
    return undefined;
  }
}

/**
 * The fallback language among `codes`: the closest to the one asked for (`'sv-SE'` is `'sv'`),
 * English when none is asked for, and `null` when the viewer has no language for it.
 */
export const fallbackCodeOf = (
  fallback: string | undefined,
  codes: readonly string[],
): string | null => (fallback === undefined ? 'en' : negotiateLocale(codes, [fallback]));

const isDictionary = (value: unknown): value is TranslationDictionary =>
  typeof value === 'object' && value !== null;

/**
 * `over` merged into `base`, both left as they are, with dotted keys expanded:
 * `{ 'acme.send': 'X' }` and `{ acme: { send: 'X' } }` are the same strings.
 */
export function mergeTranslations(
  base: TranslationDictionary,
  over: TranslationDictionary,
): TranslationDictionary {
  const merged: Record<string, string | TranslationDictionary> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const path = key.split('.');
    let node = merged;
    for (let i = 0; i < path.length - 1; i++) {
      const previous = node[path[i]];
      node = (node[path[i]] = isDictionary(previous) ? { ...previous } : {}) as Record<
        string,
        string | TranslationDictionary
      >;
    }
    const leaf = path[path.length - 1];
    const existing = node[leaf];
    node[leaf] =
      typeof value === 'string'
        ? value
        : mergeTranslations(isDictionary(existing) ? existing : {}, value);
  }
  return merged;
}

const withStrings = (pack: Locale, over: TranslationDictionary | undefined): Locale =>
  over ? { ...pack, translations: mergeTranslations(pack.translations, over) } : pack;

const isLoader = (strings: LanguageStrings): strings is StringsLoader =>
  typeof strings === 'function';

/** What a {@link StringsLoader} resolved to, as words: a module's `default` export, or the words. */
const wordsOf = (
  loaded: TranslationDictionary | { readonly default: TranslationDictionary },
): TranslationDictionary => (isDictionary(loaded.default) ? loaded.default : loaded);

/** A language's words from `strings`, in the order given: the ones given as words, and all of them. */
interface StringsParts {
  readonly words: TranslationDictionary | undefined;
  readonly load: (() => Promise<TranslationDictionary>) | undefined;
}

function partsOf(given: readonly LanguageStrings[]): StringsParts {
  const words = given
    .filter((strings): strings is TranslationDictionary => !isLoader(strings))
    .reduce<
      TranslationDictionary | undefined
    >((merged, over) => mergeTranslations(merged ?? {}, over), undefined);
  if (!given.some(isLoader)) return { words, load: undefined };
  const load = () =>
    Promise.all(
      given.map((strings) =>
        isLoader(strings) ? strings().then(wordsOf) : Promise.resolve(strings),
      ),
    ).then((all) => all.reduce(mergeTranslations, {}));
  return { words, load };
}

/** Scripts written right to left, by their ISO 15924 code. */
const RIGHT_TO_LEFT_SCRIPTS = new Set([
  'Adlm',
  'Arab',
  'Aran',
  'Hebr',
  'Mand',
  'Mend',
  'Nkoo',
  'Rohg',
  'Samr',
  'Syrc',
  'Thaa',
  'Yezi',
]);

/**
 * How a language reads, from the script its code names (`ku-Arab`) or, without one, the script
 * it is usually written in (`fa` is written in Arabic script). `'ltr'` for a code the browser
 * can't read.
 */
export function directionOf(code: string): TextDirection {
  try {
    const { script } = new Intl.Locale(code).maximize();
    return script !== undefined && RIGHT_TO_LEFT_SCRIPTS.has(script) ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

/** A language's name in itself (`'svenska'` for `sv`); its code where the browser has none. */
function nameOf(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The viewer's languages, with the app's `strings` in them. */
export interface ViewerLocales {
  /** The languages there from the start: English, and each one `strings` adds. */
  readonly locales: readonly Locale[];
  /** The viewer's other languages, loaded the first time they show. */
  readonly loaders: Readonly<Record<string, LocalePackLoader>>;
  /** Every language's code, English first: what `locale` is matched against. */
  readonly codes: readonly string[];
}

/**
 * The viewer's languages with the app's `strings` over them. A code of one of the viewer's
 * languages (in any case: `zh-cn` is `zh-CN`) changes that language's words; any other code
 * becomes a language of its own, which falls back to the fallback language for the words it
 * doesn't give. Words given as a function load with their language, and the language shows once
 * they're in; English, in every build, shows its words meanwhile.
 */
export function localesOf(strings: Readonly<Record<string, LanguageStrings>> = {}): ViewerLocales {
  const builtInCodes = ['en', ...Object.keys(LOCALE_LOADERS)];
  const builtInCodeOf = (code: string) =>
    builtInCodes.find((builtIn) => builtIn.toLowerCase() === code.toLowerCase());
  // The app's strings by the code they're shown under, a built-in language's code as the viewer
  // spells it.
  const byCode = new Map<string, LanguageStrings[]>();
  for (const [code, over] of Object.entries(strings)) {
    const shownAs = builtInCodeOf(code) ?? code;
    byCode.set(shownAs, [...(byCode.get(shownAs) ?? []), over]);
  }
  const partsByCode = new Map([...byCode].map(([code, given]) => [code, partsOf(given)]));

  const english = partsByCode.get('en');
  const locales: Locale[] = [withStrings(en, english?.words)];
  const loaders: Record<string, LocalePackLoader> = {};
  if (english?.load) {
    const load = english.load;
    loaders.en = () => load().then((words) => withStrings(en, words));
  }
  for (const [code, loadPack] of Object.entries(LOCALE_LOADERS)) {
    const parts = partsByCode.get(code);
    const load = parts?.load;
    const words = parts?.words;
    loaders[code] = load
      ? () => Promise.all([loadPack(), load()]).then(([pack, over]) => withStrings(pack, over))
      : words
        ? () => loadPack().then((pack) => withStrings(pack, words))
        : loadPack;
  }
  for (const [code, { words, load }] of partsByCode) {
    if (builtInCodeOf(code) !== undefined) continue;
    const language = { code, name: nameOf(code), direction: directionOf(code) };
    if (load) loaders[code] = () => load().then((translations) => ({ ...language, translations }));
    else locales.push({ ...language, translations: words ?? {} });
  }
  return { locales, loaders, codes: [...new Set([...builtInCodes, ...byCode.keys()])] };
}
