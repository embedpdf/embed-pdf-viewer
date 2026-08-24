/**
 * External-URI hygiene for PDF link annotations — written ONCE here so every
 * framework adapter (react, vue, svelte, angular) shares the same policy.
 *
 * PDFs are untrusted input: a link's `/URI` can carry anything, including
 * `javascript:` payloads. The default allowlist covers what a document link
 * legitimately opens; everything else (javascript:, file:, data:, vbscript:,
 * custom app schemes) resolves to `null` and the adapters render the link
 * WITHOUT an href — activation still reports through the plugin, so an
 * embedder that needs a custom scheme can handle it in `onActivate`.
 */
const DEFAULT_ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Validate a link URI for opening in the browser. Returns the URI when its
 * scheme is allowed (scheme-relative and bare URIs resolve as https), else
 * `null`. Never throws — a malformed URI is just an unopenable one.
 */
export function sanitizeExternalUri(
  uri: string,
  allowedSchemes: Iterable<string> = DEFAULT_ALLOWED_SCHEMES,
): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  const allowed = new Set(
    [...allowedSchemes].map((s) => (s.endsWith(':') ? s.toLowerCase() : `${s.toLowerCase()}:`)),
  );
  try {
    // Base resolves scheme-relative ("//host") and bare ("example.com/x" is a
    // relative path → https) forms; an absolute scheme wins over the base.
    const url = new URL(trimmed, 'https://invalid.example/');
    return allowed.has(url.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}
