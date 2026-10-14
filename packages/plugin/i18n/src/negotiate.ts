/**
 * Pure locale negotiation over language tags (RFC 5646) — strings in, string
 * out. The plugin never reads the platform; the embedder feeds it whatever
 * request list its environment offers:
 *
 * ```ts
 * // browser shell:  negotiateLocale(['en', 'es', 'ar'], navigator.languages)
 * // server render:  negotiateLocale(codes, parseAcceptLanguage(header))
 * ```
 *
 * Matching, per requested code in preference order:
 *   1. exact match (case-insensitive):        `es-MX` → `es-MX`
 *   2. request narrowed to its language:      `en-GB` → `en`
 *   3. any available dialect of the language: `zh`    → `zh-Hans`
 *
 * Steps 2 and 3 match only within the script the language is written in, as
 * `Intl.Locale#maximize` gives it: `zh-TW` and `zh-HK` are Traditional
 * Chinese, so `zh-CN` (Simplified) isn't theirs, and they get no match until
 * a Traditional language is available. Where the platform can't tell a tag's
 * script, the language alone decides.
 *
 * Returns the matched code exactly as it appears in `available`, or null.
 */
/** The script a tag's language is written in (`zh-TW` → `Hant`, `zh` → `Hans`), or null. */
function scriptOf(code: string): string | null {
  try {
    return new Intl.Locale(code).maximize().script ?? null;
  } catch {
    return null;
  }
}

/** Whether two tags are written in the same script, or one of them can't say. */
function sameScript(left: string, right: string): boolean {
  const leftScript = scriptOf(left);
  const rightScript = scriptOf(right);
  return leftScript === null || rightScript === null || leftScript === rightScript;
}

export function negotiateLocale(
  available: readonly string[],
  requested: readonly string[],
): string | null {
  const byCanonical = new Map<string, string>();
  for (const code of available) {
    const canonical = code.toLowerCase();
    if (!byCanonical.has(canonical)) byCanonical.set(canonical, code);
  }
  const languageOf = (code: string) => code.toLowerCase().split('-')[0];

  for (const wanted of requested) {
    const exact = byCanonical.get(wanted.toLowerCase());
    if (exact !== undefined) return exact;
  }
  for (const wanted of requested) {
    const narrowed = byCanonical.get(languageOf(wanted));
    if (narrowed !== undefined && sameScript(wanted, narrowed)) return narrowed;
  }
  for (const wanted of requested) {
    const language = languageOf(wanted);
    for (const [canonical, original] of byCanonical) {
      if (languageOf(canonical) === language && sameScript(wanted, original)) return original;
    }
  }
  return null;
}
