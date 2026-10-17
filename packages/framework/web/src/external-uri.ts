/**
 * External-URI hygiene for PDF link annotations — written once here so every
 * framework adapter (react, vue, svelte, angular) shares the same policy.
 *
 * PDFs are untrusted input: a link's `/URI` can carry anything, including
 * `javascript:` payloads. The default allowlist covers what a document link
 * legitimately opens; everything else (javascript:, file:, data:, vbscript:,
 * custom app schemes) resolves to `null` and the adapters render the link
 * without an href — activation still reports through the plugin, so an
 * embedder that needs a custom scheme can handle it in `onActivate`.
 */
const DEFAULT_ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** A URI that names its scheme (RFC 3986: a letter, then letters, digits, `+`, `-` or `.`). */
const SCHEME = /^[a-z][a-z\d+.-]*:/i;

/**
 * The absolute address a link means, never read against the page around the viewer: one with
 * a scheme as written; a scheme-relative `//host` on https; a bare `www.` host on https, as an
 * address bar reads it. Anything else is relative to the document (`/help`, `../x`, `page2.html`)
 * and has no document address to resolve against here, so it means nothing: read against the
 * host page, it would open the app's own pages.
 */
function absoluteUri(uri: string): string | null {
  if (SCHEME.test(uri)) return uri;
  if (uri.startsWith('//')) return `https:${uri}`;
  if (/^www\./i.test(uri)) return `https://${uri}`;
  return null;
}

/**
 * Validate a link URI for opening in the browser. Returns the absolute URI to open when its
 * scheme is allowed (scheme-relative and bare `www.` URIs become https), else `null`. Never
 * throws — a malformed URI is just an unopenable one.
 */
export function sanitizeExternalUri(
  uri: string,
  allowedSchemes: Iterable<string> = DEFAULT_ALLOWED_SCHEMES,
): string | null {
  const absolute = absoluteUri(uri.trim());
  if (!absolute) return null;
  const allowed = new Set(
    [...allowedSchemes].map((scheme) =>
      scheme.endsWith(':') ? scheme.toLowerCase() : `${scheme.toLowerCase()}:`,
    ),
  );
  try {
    return allowed.has(new URL(absolute).protocol) ? absolute : null;
  } catch {
    return null;
  }
}

/**
 * Open a link target in a new tab when its address is allowed (`http`,
 * `https`, `mailto`, `tel`); anything else is refused. True when it opened.
 * Call it inside the user's click (the link plugin's `activate()` does), so
 * the click is still the gesture that opens the tab.
 */
export function openExternalUri(uri: string): boolean {
  const href = sanitizeExternalUri(uri);
  if (!href || typeof window === 'undefined') return false;
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}
