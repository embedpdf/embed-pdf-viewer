/**
 * Pure function that turns a request path + a `CdnAccessInfo` block
 * into the final URL the SDK should hit, plus any header/cookie side
 * effects to attach. Used by both:
 *   - the @cloudpdf/engine HttpClient (to actually route requests through
 *     the CDN edge when an /access response says it can)
 *   - the smoke/diagnostic inspector (to PREVIEW what the SDK would do
 *     for a given path, with no network)
 *
 * Keeping this in engine-core means cloud-side request routing and
 * server-side test fixtures use the SAME algorithm. If a regression
 * sneaks in, both ends break together.
 *
 * Selection rules
 * ───────────────
 *   1. Resolve the request path to a `DocResourceId` via DOC_RESOURCES
 *      (longest-prefix-match on the resolved `pathPrefix`). Routes
 *      that don't map to a known resource (admin, /access itself) get
 *      `routedToCdn: false` and stay on origin.
 *   2. If `baseUrlOverrides[resourceId]` exists, swap the request's
 *      origin to that CDN origin. If absent, the request stays on
 *      origin — that's how scope narrowing works at the edge: the
 *      server only emits overrides for resources the caller's scope
 *      grants.
 *   3. Find the LONGEST-matching `signedPathPolicies` entry (its
 *      `pathPrefix` is a prefix of the request path). Append its
 *      `queryParams`. No match falls back to `signedQueryParams` if
 *      the adapter emitted a global token.
 *   4. `signedCookies` and `authHeader` are surfaced verbatim — the
 *      HttpClient sets cookies once per session and applies the
 *      header to every CDN request.
 */

import { DOC_RESOURCES, type DocResourceId } from '../resources';

/**
 * Subset of `CdnAccessInfo` this function needs. The full type lives
 * in `engine/DocumentSecurityService.ts` (it's part of the access
 * response); we mirror just the fields we read so this module is
 * decoupled from the security service surface.
 */
export interface CdnAccessInfoForApply {
  readonly adapter: string;
  readonly baseUrlOverrides: Partial<Record<string, string>> | null;
  readonly authHeader: { readonly name: string; readonly value: string } | null;
  readonly signedQueryParams: Record<string, string> | null;
  readonly signedCookies: ReadonlyArray<{
    readonly name: string;
    readonly value: string;
    readonly domain?: string;
    readonly path?: string;
    readonly expires?: number;
  }> | null;
  readonly signedPathPolicies: ReadonlyArray<{
    readonly pathPrefix: string;
    readonly queryParams: Record<string, string>;
  }> | null;
}

export interface ApplyCdnAccessInput {
  /** Path portion of the request (must begin with `/`). */
  readonly path: string;
  /** API server origin the SDK would normally hit, e.g. `https://api.example.com`. */
  readonly originUrl: string;
  /** Doc id used to resolve resource path prefixes. */
  readonly docId: string;
  /** Layer name for layer-scoped resources (defaults to `'default'`). */
  readonly layerName?: string;
  /** Access block from /v1/access. When null, every call goes to origin. */
  readonly cdn: CdnAccessInfoForApply | null;
}

export interface ApplyCdnAccessResult {
  /** Final URL the SDK should fetch. */
  readonly url: string;
  /** Resource the path was identified as, or null if it's not a DOC_RESOURCES route. */
  readonly resourceId: DocResourceId | null;
  /** True iff the request was routed to the CDN; false means origin fallthrough. */
  readonly routedToCdn: boolean;
  /** The signedPathPolicies entry that matched, if any. */
  readonly matchedPolicy: {
    readonly pathPrefix: string;
    readonly queryParams: Record<string, string>;
  } | null;
  /** Single global header to attach (custom-hmac header mode only). */
  readonly authHeader: { readonly name: string; readonly value: string } | null;
  /** Cookies the SDK should set on the CDN origin before this request. */
  readonly cookies: CdnAccessInfoForApply['signedCookies'];
  /**
   * Human-readable explanation when `routedToCdn` is false. Empty
   * string when the request did route to CDN.
   */
  readonly fallbackReason: string;
}

export function applyCdnAccess(input: ApplyCdnAccessInput): ApplyCdnAccessResult {
  const { path, originUrl, docId, layerName, cdn } = input;
  const layer = layerName ?? 'default';

  // 1. Identify the resource by path prefix (or null if it's not a
  // DOC_RESOURCES route — admin endpoints, /access itself, /warm).
  const resourceId = resolveResourceIdForPath(path, docId, layer);

  // No CDN configured (no /access call yet, or signer is `none`).
  if (!cdn || cdn.adapter === 'none') {
    return {
      url: `${trimRight(originUrl)}${path}`,
      resourceId,
      routedToCdn: false,
      matchedPolicy: null,
      authHeader: null,
      cookies: null,
      fallbackReason: cdn
        ? 'CDN signer is `none` — every request stays on origin.'
        : 'No CdnAccessInfo on this session — request stays on origin.',
    };
  }

  // 2. Not a known cacheable resource → stays on origin.
  if (!resourceId) {
    return {
      url: `${trimRight(originUrl)}${path}`,
      resourceId: null,
      routedToCdn: false,
      matchedPolicy: null,
      authHeader: null,
      cookies: null,
      fallbackReason: 'Request path does not match any known DOC_RESOURCES route.',
    };
  }

  const cdnOrigin = cdn.baseUrlOverrides?.[resourceId];
  if (!cdnOrigin) {
    // Resource granted no CDN override → caller's scope didn't grant
    // it (or it's a non-cacheable resource like /head /download).
    return {
      url: `${trimRight(originUrl)}${path}`,
      resourceId,
      routedToCdn: false,
      matchedPolicy: null,
      authHeader: null,
      cookies: null,
      fallbackReason: `No baseUrlOverrides[${resourceId}] — scope does not grant this resource through the CDN.`,
    };
  }

  // 3. Find the longest matching signedPathPolicies entry.
  const matchedPolicy = (cdn.signedPathPolicies ?? [])
    .filter((p) => path.startsWith(p.pathPrefix))
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length)[0];

  const url = new URL(`${trimRight(cdnOrigin)}${path}`);
  if (matchedPolicy) {
    for (const [k, v] of Object.entries(matchedPolicy.queryParams)) {
      url.searchParams.set(k, v);
    }
  } else if (cdn.signedQueryParams) {
    for (const [k, v] of Object.entries(cdn.signedQueryParams)) {
      url.searchParams.set(k, v);
    }
  }

  return {
    url: url.toString(),
    resourceId,
    routedToCdn: true,
    matchedPolicy: matchedPolicy
      ? { pathPrefix: matchedPolicy.pathPrefix, queryParams: matchedPolicy.queryParams }
      : null,
    authHeader: cdn.authHeader,
    cookies: cdn.signedCookies,
    fallbackReason: '',
  };
}

/**
 * Walk DOC_RESOURCES and pick the entry whose resolved `pathPrefix`
 * is a (longest) prefix of `path`. Returns null when no resource
 * matches — admin routes, /access, /warm fall into this bucket.
 *
 * Each cacheable resource has a DISTINCT prefix (paths v2 invariant),
 * so longest-match is deterministic.
 */
export function resolveResourceIdForPath(
  path: string,
  docId: string,
  layerName: string,
): DocResourceId | null {
  let best: { id: DocResourceId; prefixLength: number } | null = null;
  for (const id of Object.keys(DOC_RESOURCES) as DocResourceId[]) {
    const r = DOC_RESOURCES[id];
    const prefix = r.resolvePathPrefix(docId, layerName);
    if (!path.startsWith(prefix)) continue;
    if (!best || prefix.length > best.prefixLength) {
      best = { id, prefixLength: prefix.length };
    }
  }
  return best?.id ?? null;
}

function trimRight(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
