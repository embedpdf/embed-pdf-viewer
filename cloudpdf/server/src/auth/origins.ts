/**
 * Origin-lock matching for doc tokens and share grants.
 *
 * The lock's threat model is hotlink embedding: a share token or doc
 * JWT lifted from one page and presented from another site's browser.
 * Browsers attach `Origin` to every cross-origin request and it cannot
 * be forged or suppressed from page JavaScript, so matching it is the
 * whole enforcement. Non-browser callers (no Origin header) are
 * governed by the token itself — a valid short-lived credential IS the
 * authority there, which is why enforcement is presence-conditional
 * rather than mandatory. Hotlink prevention, not DRM.
 *
 * Pattern grammar (validated at mint/create time by the contract):
 *   scheme://host[:port]        exact match, case-insensitive host
 *   scheme://*.host[:port]      one leading wildcard label matching ONE
 *                               OR MORE subdomain labels — `*.acme.com`
 *                               covers `docs.acme.com` and
 *                               `a.b.acme.com`, never bare `acme.com`
 *                               and never `evilacme.com`
 *
 * Matching is on the origin tuple only: scheme, host, and port (with
 * scheme-default ports normalized), never paths.
 */

interface OriginTuple {
  scheme: string;
  host: string;
  /** Normalized: explicit port, or the scheme default. */
  port: string;
}

const DEFAULT_PORTS: Record<string, string> = { http: '80', https: '443' };

function parseOrigin(value: string): OriginTuple | null {
  const match = /^(https?):\/\/([^/:?#]+)(?::(\d{1,5}))?$/.exec(value.trim());
  if (!match) return null;
  const scheme = match[1]!.toLowerCase();
  return {
    scheme,
    host: match[2]!.toLowerCase(),
    port: match[3] ?? DEFAULT_PORTS[scheme]!,
  };
}

/**
 * True when `origin` (a browser `Origin` header value) is allowed by at
 * least one pattern. Malformed origins and malformed patterns never
 * match — fail closed.
 */
export function matchesOrigin(origin: string, patterns: ReadonlyArray<string>): boolean {
  const got = parseOrigin(origin);
  if (!got) return false;
  for (const pattern of patterns) {
    const wildcard = pattern.includes('://*.');
    const want = parseOrigin(wildcard ? pattern.replace('://*.', '://') : pattern);
    if (!want) continue;
    if (want.scheme !== got.scheme || want.port !== got.port) continue;
    if (wildcard) {
      // One or more extra leading labels: `docs.acme.com` ends with
      // `.acme.com`; bare `acme.com` does not.
      if (got.host.endsWith(`.${want.host}`)) return true;
    } else if (got.host === want.host) {
      return true;
    }
  }
  return false;
}
