/**
 * The lookup: a key in, a string out. Pure, with no platform access
 * (`Intl.PluralRules` is core ECMAScript, not DOM).
 */
import type { Locale, TranslateOptions, TranslationDictionary } from './contract';
import { embedpdfStringsFor } from './strings';

/** Walk a dotted path (`'commands.zoom.in'`) through a dictionary. */
function lookup(
  dictionary: TranslationDictionary | undefined,
  key: string,
): string | TranslationDictionary | undefined {
  if (!dictionary) return undefined;
  let node: string | TranslationDictionary | undefined = dictionary;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return node;
}

/** The language's plural form for a count; `'one'` or `'other'` when the runtime has no rules for it. */
function pluralCategory(locale: string, count: number): string {
  try {
    return new Intl.PluralRules(locale).select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

/** A string is the answer; a branch needs a plural form, picked by `params.count`. */
function resolveNode(
  node: string | TranslationDictionary | undefined,
  locale: string,
  params?: Record<string, string | number>,
): string | undefined {
  if (typeof node === 'string') return node;
  if (node !== undefined && typeof params?.count === 'number') {
    const branch = node[pluralCategory(locale, params.count)] ?? node['other'];
    if (typeof branch === 'string') return branch;
  }
  return undefined;
}

/** Fill in `{name}` slots; a slot without a value stays as it is, so it shows while testing. */
export function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, slot) =>
    params[slot] !== undefined ? String(params[slot]) : match,
  );
}

/** What a lookup reads: the two languages it tries, and the app's strings. */
export interface TranslationSources {
  readonly locale: string;
  readonly fallbackLocale: string;
  /** The app's loaded languages, by code. */
  readonly locales: Readonly<Record<string, Locale>>;
}

export interface TranslateResult {
  readonly text: string;
  /** False when no language has the key: `text` is then the fallback or the key. */
  readonly found: boolean;
}

/** A key in one language: the app's string, then EmbedPDF's own. */
const stringIn = (
  sources: TranslationSources,
  code: string,
  key: string,
  params?: Record<string, string | number>,
): string | undefined =>
  resolveNode(lookup(sources.locales[code]?.translations, key), code, params) ??
  resolveNode(lookup(embedpdfStringsFor(code), key), code, params);

/**
 * A key's string: in the current language, then in the fallback language, then
 * `options.fallback` (with its slots filled too), then the key itself.
 */
export function translate(
  sources: TranslationSources,
  key: string,
  options?: TranslateOptions,
): TranslateResult {
  const text =
    stringIn(sources, sources.locale, key, options?.params) ??
    stringIn(sources, sources.fallbackLocale, key, options?.params);
  if (text !== undefined) return { text: interpolate(text, options?.params), found: true };
  if (options?.fallback !== undefined)
    return { text: interpolate(options.fallback, options.params), found: false };
  return { text: key, found: false };
}
