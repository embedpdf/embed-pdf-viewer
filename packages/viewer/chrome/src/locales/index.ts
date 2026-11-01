/**
 * The viewer's languages: English in every build, the others each in a chunk of its own that
 * loads the first time the viewer shows it, and the languages an app adds or changes through
 * `strings`. A language reads right to left when its pack says so (Arabic, Hebrew), or, for a
 * language from `strings`, when its code names a right-to-left script (`fa`, `ur`, `und-Arab`).
 */
import { negotiateLocale } from '@embedpdf/react/i18n';
import type { Locale, TextDirection, TranslationDictionary } from '@embedpdf/react/i18n';

import { en } from './en';

export { en };

/** A language that loads when it's first shown. */
export type LocalePackLoader = () => Promise<Locale>;

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

/**
 * The language a `locale` value shows, among `codes`: the browser's languages for `'auto'`,
 * else the closest to the one asked for (`'es-MX'` shows `'es'`), else English.
 */
export const localeCodeOf = (locale: string, codes: readonly string[]): string =>
  negotiateLocale(
    codes,
    locale !== 'auto' ? [locale] : typeof navigator !== 'undefined' ? navigator.languages : [],
  ) ?? 'en';

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
 * becomes a language of its own, which falls back to English for the words it doesn't give.
 */
export function localesOf(
  strings: Readonly<Record<string, TranslationDictionary>> = {},
): ViewerLocales {
  const builtInCodes = ['en', ...Object.keys(LOCALE_LOADERS)];
  const builtInCodeOf = (code: string) =>
    builtInCodes.find((builtIn) => builtIn.toLowerCase() === code.toLowerCase());
  // The app's strings by the code they're shown under, a built-in language's code as the viewer
  // spells it.
  const byCode = new Map<string, TranslationDictionary>();
  for (const [code, over] of Object.entries(strings)) {
    const shownAs = builtInCodeOf(code) ?? code;
    byCode.set(shownAs, mergeTranslations(byCode.get(shownAs) ?? {}, over));
  }

  const locales: Locale[] = [withStrings(en, byCode.get('en'))];
  const loaders: Record<string, LocalePackLoader> = {};
  for (const [code, load] of Object.entries(LOCALE_LOADERS)) {
    const over = byCode.get(code);
    loaders[code] = over ? () => load().then((pack) => withStrings(pack, over)) : load;
  }
  for (const [code, over] of byCode) {
    if (builtInCodeOf(code) !== undefined) continue;
    locales.push({ code, name: nameOf(code), direction: directionOf(code), translations: over });
  }
  return { locales, loaders, codes: [...new Set([...builtInCodes, ...byCode.keys()])] };
}
