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
 * Returns the matched code exactly as it appears in `available`, or null.
 */
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
    if (narrowed !== undefined) return narrowed;
  }
  for (const wanted of requested) {
    const language = languageOf(wanted);
    for (const [canonical, original] of byCanonical) {
      if (languageOf(canonical) === language) return original;
    }
  }
  return null;
}
