/**
 * Google Cloud CDN signer — HMAC-SHA1 signed URL prefix.
 *
 * Algorithm (per Google's "Signed URL prefixes" docs):
 *   URLPrefix = base64url(canonical-prefix)            // e.g. "https://cdn.example.com/v1/docs/foo/"
 *   policy   = "URLPrefix=<URLPrefix>&Expires=<unix>&KeyName=<name>"
 *   Signature = base64url(hmac-sha1(keyValue, policy))
 *
 * Client appends `URLPrefix=&Expires=&KeyName=&Signature=` to every
 * URL whose path starts with the signed prefix. One signature
 * authenticates many requests until `Expires` passes — which is
 * exactly the same shape as Bunny / Azure FD, but with a per-prefix
 * policy rather than a per-token form.
 *
 * CDN-side setup: register the key on the backend service via
 *   gcloud compute backend-services add-signed-url-key
 *
 * **Per-resource scope enforcement at the edge** (paths v2)
 *
 * We sign each granted cacheable resource's distinct prefix separately
 * — `/v1/docs/{id}/render/pages/`, `/v1/docs/{id}/text/pages/`, etc. —
 * so the signature embeds the resource type. A render-only scope's
 * signed-prefix policy can't be replayed against a text URL because
 * the URLPrefix in the policy is `…/render/pages/`, not `…/text/pages/`.
 *
 * Output channels: `baseUrlOverrides` per granted cacheable resource +
 * one `signedPathPolicies` entry per coverage prefix. Cloud CDN uses
 * path-policies (not single-token query params) because the signature
 * is over the prefix itself, not just an opaque token.
 *
 * Purge: stub here; real urlMaps.invalidateCache lands in commit H.
 */

import type { CdnAccessInfo } from '@embedpdf/engine-core/runtime';

import type { CdnSigner, PurgeInput, PurgeReceipt, SignInput } from '../CdnSigner';
import { base64url } from '../util/base64url';
import { buildBaseUrlOverrides } from '../util/baseUrlOverrides';
import { hmacSha1 } from '../util/hmac';

export interface CloudCdnSignerOptions {
  urlPrefix: string;
  keyName: string;
  /** 128-bit HMAC key as base64-encoded bytes (matches gcloud's output). */
  keyValue: string;
  projectId?: string;
  serviceAccountKey?: string;
}

export class CloudCdnSigner implements CdnSigner {
  readonly info: { kind: 'cloud-cdn'; urlPrefix: string; keyName: string };
  private readonly keyBytes: Buffer;
  private readonly cdnOrigin: string;

  constructor(private readonly opts: CloudCdnSignerOptions) {
    if (!opts.keyValue) throw new Error('CloudCdnSigner requires keyValue');
    if (!opts.urlPrefix) throw new Error('CloudCdnSigner requires urlPrefix');
    if (!opts.keyName) throw new Error('CloudCdnSigner requires keyName');
    this.keyBytes = Buffer.from(opts.keyValue, 'base64');
    if (this.keyBytes.byteLength === 0) {
      throw new Error('CloudCdnSigner keyValue must be base64-encoded bytes');
    }
    this.cdnOrigin = stripTrailingSlash(opts.urlPrefix);
    this.info = { kind: 'cloud-cdn', urlPrefix: this.cdnOrigin, keyName: opts.keyName };
  }

  buildAccess(input: SignInput): CdnAccessInfo {
    const signedPathPolicies = input.coverage.map((entry) => {
      const canonicalPrefix = `${this.cdnOrigin}${entry.pathPrefix}`;
      const queryParams = signCloudCdnPrefix(
        this.keyBytes,
        this.opts.keyName,
        canonicalPrefix,
        input.expiresAt,
      );
      return { pathPrefix: entry.pathPrefix, queryParams };
    });
    return {
      adapter: 'cloud-cdn',
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
    return { adapter: 'cloud-cdn', id: '', submittedAt: Date.now(), status: 'no-op' };
  }
}

/**
 * Compute the four query params Google Cloud CDN's edge expects for
 * a signed URL prefix. Exported for testing — pure function.
 */
export function signCloudCdnPrefix(
  keyBytes: Buffer,
  keyName: string,
  canonicalPrefix: string,
  expiresAt: number,
): Record<string, string> {
  const urlPrefixB64 = base64url(Buffer.from(canonicalPrefix, 'utf8'));
  const policy = `URLPrefix=${urlPrefixB64}&Expires=${expiresAt}&KeyName=${keyName}`;
  const signature = base64url(hmacSha1(keyBytes, policy));
  return {
    URLPrefix: urlPrefixB64,
    Expires: String(expiresAt),
    KeyName: keyName,
    Signature: signature,
  };
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
