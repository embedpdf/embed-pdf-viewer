/**
 * BunnyCDN signer — HMAC-SHA256 zone token authentication.
 *
 * Algorithm (Bunny's documented "Token Authentication" feature):
 *   token = base64url( sha256( zoneToken + path + expires ) )
 *
 * `path` is the URL path PREFIX the token authorizes — Bunny accepts
 * the same token for any URL whose path STARTS WITH the signed prefix,
 * until `expires` passes.
 *
 * **Per-resource scope enforcement at the edge** (paths v2)
 *
 * We do NOT sign a single doc-wide prefix. That would mean a caller
 * granted only render also gets text/annotations/geometry through the
 * same token. Instead, we sign each cacheable resource's distinct
 * prefix separately — `/v1/docs/{id}/render/pages/`,
 * `/v1/docs/{id}/text/pages/`, etc. — and emit one
 * `signedPathPolicies` entry per granted resource.
 *
 * The SDK fetch wrapper picks the matching `pathPolicy` entry for
 * each outgoing CDN request (longest-prefix-match) and appends its
 * `token` + `expires` query params. A request to a resource the
 * scope didn't grant has no matching policy and goes straight to
 * origin (where the JWT check rejects it).
 *
 * CDN-side setup: enable "Token Authentication" in the zone settings
 * and paste the same zoneToken.
 *
 * Purge: stub returns `no-op` here; real REST call lands in commit H.
 */

import type { CdnAccessInfo } from '@embedpdf/engine-core/runtime';

import type { CdnSigner, PurgeInput, PurgeReceipt, SignInput } from '../CdnSigner';
import { base64url } from '../util/base64url';
import { buildBaseUrlOverrides } from '../util/baseUrlOverrides';
import { hmacSha256 } from '../util/hmac';

export interface BunnyCdnSignerOptions {
  zoneHostname: string;
  zoneToken: string;
  apiKey?: string;
}

export class BunnyCdnSigner implements CdnSigner {
  readonly info: { kind: 'bunny'; zoneHostname: string };
  private readonly zoneToken: string;
  private readonly cdnOrigin: string;

  constructor(private readonly opts: BunnyCdnSignerOptions) {
    if (!opts.zoneToken) throw new Error('BunnyCdnSigner requires zoneToken');
    if (!opts.zoneHostname) throw new Error('BunnyCdnSigner requires zoneHostname');
    this.zoneToken = opts.zoneToken;
    this.cdnOrigin = `https://${opts.zoneHostname}`;
    this.info = { kind: 'bunny', zoneHostname: opts.zoneHostname };
  }

  buildAccess(input: SignInput): CdnAccessInfo {
    const signedPathPolicies = input.coverage.map((entry) => {
      const { token, expires } = signBunnyToken(this.zoneToken, entry.pathPrefix, input.expiresAt);
      return {
        pathPrefix: entry.pathPrefix,
        queryParams: { token, expires: String(expires) },
      };
    });
    return {
      adapter: 'bunny',
      expiresAt: input.expiresAt,
      cache: { scope: 'edge-shared', immutableVersionedReads: true },
      baseUrlOverrides: buildBaseUrlOverrides(this.cdnOrigin, input.coverage),
      authHeader: null,
      signedQueryParams: null,
      signedCookies: null,
      signedPathPolicies: signedPathPolicies.length === 0 ? null : signedPathPolicies,
    };
  }

  async purge(_input: PurgeInput): Promise<PurgeReceipt> {
    // Real REST call (DELETE https://api.bunny.net/purge?url=...) lands
    // in commit H alongside the PurgeCoordinator + cdn_purge_jobs table.
    return { adapter: 'bunny', id: '', submittedAt: Date.now(), status: 'no-op' };
  }
}

/**
 * Compute a Bunny zone-token signature for the given path prefix and
 * expiry. Exported for testing — the function is pure.
 */
export function signBunnyToken(
  zoneToken: string,
  path: string,
  expiresAt: number,
): { token: string; expires: number } {
  const message = `${zoneToken}${path}${expiresAt}`;
  const token = base64url(hmacSha256(zoneToken, message));
  return { token, expires: expiresAt };
}
