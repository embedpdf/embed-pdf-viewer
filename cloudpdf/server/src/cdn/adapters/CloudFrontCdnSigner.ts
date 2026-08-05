/**
 * AWS CloudFront signer — RSA-SHA1 with two output modes:
 *
 *   'cookies' (default): three cookies set by the client once. The
 *                        policy lists one Resource glob per granted
 *                        cacheable resource — CloudFront enforces the
 *                        union at the edge. A render-only scope's
 *                        policy contains ONLY the render glob, so the
 *                        cookies can't authorize text or annotations.
 *   'urls'             : one per-prefix Policy/Signature/Key-Pair-Id
 *                        triple per granted resource, emitted via
 *                        `signedPathPolicies`. The SDK picks the
 *                        longest-matching policy per outgoing request.
 *
 * Cookies are preferred for many small reads (annotations, render
 * tiles); URLs are the fallback for cross-origin restrictions that
 * make cookies impractical.
 *
 * Algorithm (both modes share the policy + sign step):
 *   policy    = JSON.stringify({"Statement":[
 *                 { "Resource":"https://<dist>/v1/docs/<id>/render/pages/*",
 *                   "Condition":{"DateLessThan":{"AWS:EpochTime":<expires>}} },
 *                 { "Resource":"https://<dist>/v1/docs/<id>/text/pages/*",
 *                   "Condition":{ ... } },
 *                 ...one entry per granted cacheable resource
 *               ]})
 *   sig       = RSA-SHA1(privateKey, policy)
 *   policyB64 = cloudfront-base64(policy)
 *   sigB64    = cloudfront-base64(sig)
 *
 * **Per-resource scope enforcement at the edge** (paths v2)
 *
 * The policy enumerates only the granted resources' prefixes — never
 * a broad `/v1/docs/<id>/*` glob. Combined with the path-prefix
 * uniqueness invariant (see DOC_RESOURCES anti-drift test), this
 * means CloudFront enforces scope narrowly even though a single
 * RSA signature covers many URLs.
 *
 * AWS uses a custom base64 alphabet (`+`→`-`, `=`→`_`, `/`→`~`)
 * because `+ / =` are illegal in cookies and query params; see
 * util/base64url.ts::cloudfrontBase64.
 *
 * Cookie-domain warning: if the CDN domain differs from the API
 * domain, the cookies need `Domain=.example.com` set explicitly.
 * Config carries `cookieDomain`; if omitted, cookies are scoped to
 * the CDN host exactly (no cross-host coverage).
 *
 * Purge: stub here; real CreateInvalidation lands in commit H.
 */

import type { CdnAccessInfo } from '@embedpdf/engine-core/runtime';

import type { CdnSigner, PurgeInput, PurgeReceipt, SignInput } from '../CdnSigner';
import { cloudfrontBase64 } from '../util/base64url';
import { buildBaseUrlOverrides } from '../util/baseUrlOverrides';
import { rsaSha1Sign } from '../util/rsa';

export interface CloudFrontCdnSignerOptions {
  distributionDomain: string;
  keyPairId: string;
  privateKeyPem: string;
  mode: 'cookies' | 'urls';
  distributionId?: string;
  awsRegion?: string;
  cookieDomain?: string;
}

export class CloudFrontCdnSigner implements CdnSigner {
  readonly info: {
    kind: 'cloudfront';
    distributionDomain: string;
    keyPairId: string;
    mode: 'cookies' | 'urls';
  };
  private readonly cdnOrigin: string;

  constructor(private readonly opts: CloudFrontCdnSignerOptions) {
    if (!opts.privateKeyPem) throw new Error('CloudFrontCdnSigner requires privateKeyPem');
    if (!opts.keyPairId) throw new Error('CloudFrontCdnSigner requires keyPairId');
    if (!opts.distributionDomain) {
      throw new Error('CloudFrontCdnSigner requires distributionDomain');
    }
    this.cdnOrigin = `https://${opts.distributionDomain}`;
    this.info = {
      kind: 'cloudfront',
      distributionDomain: opts.distributionDomain,
      keyPairId: opts.keyPairId,
      mode: opts.mode,
    };
  }

  buildAccess(input: SignInput): CdnAccessInfo {
    const baseUrlOverrides = buildBaseUrlOverrides(this.cdnOrigin, input.coverage);

    if (this.opts.mode === 'cookies') {
      // Single multi-Resource policy: each granted prefix becomes its
      // own Resource entry, signed once. The edge admits a request
      // iff its URL matches at least one Resource AND the expiry
      // hasn't passed.
      const resources = input.coverage.map((entry) => `${this.cdnOrigin}${entry.pathPrefix}*`);
      const { policyB64, signatureB64 } =
        resources.length === 0
          ? { policyB64: '', signatureB64: '' }
          : signCloudFrontPolicyForResources(this.opts.privateKeyPem, resources, input.expiresAt);
      const cookies =
        resources.length === 0
          ? null
          : [
              {
                name: 'CloudFront-Policy',
                value: policyB64,
                ...(this.opts.cookieDomain ? { domain: this.opts.cookieDomain } : {}),
                path: '/',
                expires: input.expiresAt,
              },
              {
                name: 'CloudFront-Signature',
                value: signatureB64,
                ...(this.opts.cookieDomain ? { domain: this.opts.cookieDomain } : {}),
                path: '/',
                expires: input.expiresAt,
              },
              {
                name: 'CloudFront-Key-Pair-Id',
                value: this.opts.keyPairId,
                ...(this.opts.cookieDomain ? { domain: this.opts.cookieDomain } : {}),
                path: '/',
                expires: input.expiresAt,
              },
            ];
      return {
        adapter: 'cloudfront',
        expiresAt: input.expiresAt,
        cache: { scope: 'edge-shared', immutableVersionedReads: true },
        baseUrlOverrides,
        authHeader: null,
        signedQueryParams: null,
        signedCookies: cookies,
        signedPathPolicies: null,
      };
    }

    // urls mode: one signedPathPolicies entry per granted prefix.
    const signedPathPolicies = input.coverage.map((entry) => {
      const resource = `${this.cdnOrigin}${entry.pathPrefix}*`;
      const { policyB64, signatureB64 } = signCloudFrontPolicy(
        this.opts.privateKeyPem,
        resource,
        input.expiresAt,
      );
      return {
        pathPrefix: entry.pathPrefix,
        queryParams: {
          Policy: policyB64,
          Signature: signatureB64,
          'Key-Pair-Id': this.opts.keyPairId,
        },
      };
    });
    return {
      adapter: 'cloudfront',
      expiresAt: input.expiresAt,
      cache: { scope: 'edge-shared', immutableVersionedReads: true },
      baseUrlOverrides,
      authHeader: null,
      signedQueryParams: null,
      signedCookies: null,
      signedPathPolicies: signedPathPolicies.length === 0 ? null : signedPathPolicies,
    };
  }

  async purge(_input: PurgeInput): Promise<PurgeReceipt> {
    return { adapter: 'cloudfront', id: '', submittedAt: Date.now(), status: 'no-op' };
  }
}

/**
 * Build the CloudFront policy JSON for a single Resource + sign it.
 * Returns AWS-base64-encoded policy and signature ready to attach
 * as either cookies or query params. Exported for testing — pure
 * function.
 */
export function signCloudFrontPolicy(
  privateKeyPem: string,
  resource: string,
  expiresAt: number,
): { policyB64: string; signatureB64: string } {
  return signCloudFrontPolicyForResources(privateKeyPem, [resource], expiresAt);
}

/**
 * Like {@link signCloudFrontPolicy} but for a multi-Resource policy.
 * Each `resource` becomes its own Statement entry — CloudFront admits
 * a URL iff at least one Statement's Resource matches it (logical OR
 * across Statements). Used by cookies mode to pack one Statement per
 * granted cacheable resource into a single signature.
 *
 * Exported for testing.
 */
export function signCloudFrontPolicyForResources(
  privateKeyPem: string,
  resources: ReadonlyArray<string>,
  expiresAt: number,
): { policyB64: string; signatureB64: string } {
  const policyJson = JSON.stringify({
    Statement: resources.map((Resource) => ({
      Resource,
      Condition: { DateLessThan: { 'AWS:EpochTime': expiresAt } },
    })),
  });
  const signature = rsaSha1Sign(privateKeyPem, policyJson);
  return {
    policyB64: cloudfrontBase64(policyJson),
    signatureB64: cloudfrontBase64(signature),
  };
}
