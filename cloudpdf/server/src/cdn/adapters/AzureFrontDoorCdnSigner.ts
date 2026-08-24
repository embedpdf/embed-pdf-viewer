/**
 * Azure Front Door signer — HMAC-SHA256 token verified by the AFD
 * rules engine.
 *
 * Algorithm:
 *   token = base64url( sha256( secret + path + expires ) )
 *
 * Matches Bunny's shape (HMAC-SHA256 single-token prefix sign) but
 * is verified at the edge by a rules-engine rule rather than a
 * native built-in feature. The integrator imports the rules template
 * (`azure-fd-rules-template.json`) into their AFD profile to wire
 * the verification — the rule reads `?token=&expires=` from the
 * query, recomputes the HMAC using the rule's stored secret, and
 * rejects on mismatch or expiry.
 *
 * **Per-resource scope enforcement at the edge** (paths v2)
 *
 * We sign each granted cacheable resource's distinct prefix separately
 * — `/v1/docs/{id}/render/pages/`, `/v1/docs/{id}/text/pages/`, etc. —
 * and emit one `signedPathPolicies` entry per granted resource. The
 * SDK fetch wrapper picks the longest-matching policy and appends
 * its `token` + `expires`. A render-only token can't authorize text
 * at the edge because the AFD rule's recomputed HMAC won't match
 * when the request path's prefix is `…/text/pages/`.
 *
 * The rules-engine template included alongside this file already
 * iterates over a configured list of allowed prefixes — operators
 * configure one rule (or one ruleset) per resource type.
 *
 * Output channels: `baseUrlOverrides` per granted cacheable resource +
 * one `signedPathPolicies` entry per granted prefix.
 *
 * Purge: stub here; real Azure REST `purgeContent` lands in commit H.
 */

import type { CdnAccessInfo } from '@embedpdf/engine-core/runtime';

import type { CdnSigner, PurgeInput, PurgeReceipt, SignInput } from '../CdnSigner';
import { base64url } from '../util/base64url';
import { buildBaseUrlOverrides } from '../util/baseUrlOverrides';
import { hmacSha256 } from '../util/hmac';

export interface AzureFrontDoorCdnSignerOptions {
  endpoint: string;
  secret: string;
  profileName?: string;
  subscriptionId?: string;
}

export class AzureFrontDoorCdnSigner implements CdnSigner {
  readonly info: { kind: 'azure-fd'; endpoint: string };
  private readonly secret: string;
  private readonly cdnOrigin: string;

  constructor(private readonly opts: AzureFrontDoorCdnSignerOptions) {
    if (!opts.secret) throw new Error('AzureFrontDoorCdnSigner requires secret');
    if (!opts.endpoint) throw new Error('AzureFrontDoorCdnSigner requires endpoint');
    this.secret = opts.secret;
    this.cdnOrigin = stripTrailingSlash(opts.endpoint);
    this.info = { kind: 'azure-fd', endpoint: this.cdnOrigin };
  }

  buildAccess(input: SignInput): CdnAccessInfo {
    const signedPathPolicies = input.coverage.map((entry) => {
      const { token, expires } = signAzureFdToken(this.secret, entry.pathPrefix, input.expiresAt);
      return {
        pathPrefix: entry.pathPrefix,
        queryParams: { token, expires: String(expires) },
      };
    });
    return {
      adapter: 'azure-fd',
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
    return { adapter: 'azure-fd', id: '', submittedAt: Date.now(), status: 'no-op' };
  }
}

/** Pure HMAC-SHA256 over `secret + path + expires`. Exported for tests. */
export function signAzureFdToken(
  secret: string,
  path: string,
  expiresAt: number,
): { token: string; expires: number } {
  const message = `${secret}${path}${expiresAt}`;
  const token = base64url(hmacSha256(secret, message));
  return { token, expires: expiresAt };
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
