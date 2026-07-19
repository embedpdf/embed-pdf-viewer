/**
 * Pure BCP-47 locale negotiation — strings in, string out. The plugin never
 * reads the platform; the EMBEDDER feeds it whatever request list its
 * environment offers:
 *
 * ```ts
 * // browser shell:  negotiateLocale(['en', 'es', 'ar'], navigator.languages)
 * // server render:  negotiateLocale(codes, parseAcceptLanguage(header))
 * ```
 *
 * Matching, per requested code in preference order:
 *   1. exact match (case-insensitive):        'es-MX' → 'es-MX'
 *   2. request narrowed to its language:      'en-GB' → 'en'
 *   3. any available dialect of the language: 'zh'    → 'zh-Hans'
 *
 * Returns the matched code exactly as it appears in `available`, or null.
 */
export function negotiateLocale(
  available: readonly string[],
  requested: readonly string[],
): string | null {
  const byCanon = new Map<string, string>();
  for (const code of available) {
    const canon = code.toLowerCase();
    if (!byCanon.has(canon)) byCanon.set(canon, code);
  }
  const languageOf = (code: string) => code.toLowerCase().split('-')[0];

  for (const want of requested) {
    const exact = byCanon.get(want.toLowerCase());
    if (exact !== undefined) return exact;
  }
  for (const want of requested) {
    const narrowed = byCanon.get(languageOf(want));
    if (narrowed !== undefined) return narrowed;
  }
  for (const want of requested) {
    const language = languageOf(want);
    for (const [canon, original] of byCanon) {
      if (languageOf(canon) === language) return original;
    }
  }
  return null;
}
