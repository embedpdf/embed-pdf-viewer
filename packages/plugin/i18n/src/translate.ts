import type { I18nState, TranslateOptions, TranslationDictionary } from './types';

/**
 * The pure lookup core — state in, string out. No platform access anywhere
 * (`Intl.PluralRules` is core ECMAScript, not DOM); this is the part that
 * ports to Rust verbatim.
 */

/** Walk a dotted path ('commands.zoom.in') through a dictionary tree. */
function lookup(
  dict: TranslationDictionary | undefined,
  key: string,
): string | TranslationDictionary | undefined {
  if (!dict) return undefined;
  let node: string | TranslationDictionary | undefined = dict;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return node;
}

/** CLDR plural category for a count, with a safe fallback when the runtime
 *  lacks ICU data for the locale. */
function pluralCategory(locale: string, count: number): string {
  try {
    return new Intl.PluralRules(locale).select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

/** A leaf hit is a string; a branch object needs a plural pick via `count`. */
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

/** Replace `{slot}` markers; unknown slots stay verbatim (visible in QA). */
export function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, slot) =>
    params[slot] !== undefined ? String(params[slot]) : match,
  );
}

export interface TranslateResult {
  readonly text: string;
  /** False when the key missed every pack (text is then the fallback or the key). */
  readonly found: boolean;
}

/**
 * Resolve a key against the state: current locale → fallback locale →
 * `options.fallback` (interpolated too) → the key itself.
 */
export function translate(
  state: I18nState,
  key: string,
  options?: TranslateOptions,
): TranslateResult {
  const { locale, fallbackLocale, locales } = state;
  const text =
    resolveNode(lookup(locales[locale]?.translations, key), locale, options?.params) ??
    resolveNode(
      lookup(locales[fallbackLocale]?.translations, key),
      fallbackLocale,
      options?.params,
    );
  if (text !== undefined) return { text: interpolate(text, options?.params), found: true };
  if (options?.fallback !== undefined)
    return { text: interpolate(options.fallback, options.params), found: false };
  return { text: key, found: false };
}
