/**
 * Generic HMAC-SHA256 signer for any edge that verifies our
 * documented algorithm. This is the escape hatch used by:
 *   - Cloudflare Worker deployments (the Worker re-implements
 *     the same HMAC verification with the shared secret)
 *   - DIY edge proxies (nginx + Lua, Fastly VCL, Envoy filters)
 *   - any in-house CDN-shaped infrastructure
 *
 * Algorithm (v1):
 *   nonce = base64url(random 16 bytes)
 *   sig   = base64url( sha256( secret + path + expires + nonce ) )
 *
 * Two transports — pick one based on what the edge can read:
 *   - 'query' (recommended) : ?cdn_sig=<sig>&cdn_exp=<expires>&cdn_nonce=<nonce>
 *                              appended to every CDN URL. ONE
 *                              `signedPathPolicies` entry per granted
 *                              resource prefix — per-resource scope is
 *                              enforced at the edge because each prefix
 *                              has its own HMAC.
 *   - 'header'              : X-EmbedPDF-CDN-Signature: v1.<expires>.<nonce>.<sig>
 *                              attached to every CDN request. ONE
 *                              global signature over the doc-wide
 *                              prefix `/v1/docs/{id}/`. Use only when
 *                              the edge can't verify per-prefix query
 *                              params (e.g. very constrained Worker
 *                              runtimes). This is less secure — a
 *                              caller granted only render gets text
 *                              and annotations through the same
 *                              header. The narrowing then relies on
 *                              `baseUrlOverrides`: the SDK only routes
 *                              granted resources through the CDN, and
 *                              the rest fall through to origin where
 *                              the JWT enforces scope. Trust this only
 *                              if you trust the SDK to never craft
 *                              direct CDN URLs.
 *
 * Spec is versioned (prefix `v1.` in header / no version in query
 * params) so future format changes are detectable.
 *
 * Purge: when `purgeWebhookUrl` is set on the config, commit H will
 * POST to it; otherwise purge returns a `failed` receipt with a
 * helpful message. Today, both paths return `no-op`.
 */

import { randomBytes } from 'node:crypto';

import type { CdnAccessInfo } from '@embedpdf/engine-core/runtime';

import type { CdnSigner, PurgeInput, PurgeReceipt, SignInput } from '../CdnSigner';
import { base64url } from '../util/base64url';
import { buildBaseUrlOverrides } from '../util/baseUrlOverrides';
import { hmacSha256 } from '../util/hmac';

export interface CustomHmacCdnSignerOptions {
  cdnOrigin: string;
  secret: string;
  transport: 'header' | 'query';
  purgeWebhookUrl?: string;
}

export class CustomHmacCdnSigner implements CdnSigner {
  readonly info: { kind: 'custom-hmac'; cdnOrigin: string; transport: 'header' | 'query' };
  private readonly secret: string;
  private readonly cdnOrigin: string;

  constructor(private readonly opts: CustomHmacCdnSignerOptions) {
    if (!opts.secret) throw new Error('CustomHmacCdnSigner requires secret');
    if (!opts.cdnOrigin) throw new Error('CustomHmacCdnSigner requires cdnOrigin');
    this.secret = opts.secret;
    this.cdnOrigin = stripTrailingSlash(opts.cdnOrigin);
    this.info = { kind: 'custom-hmac', cdnOrigin: this.cdnOrigin, transport: opts.transport };
  }

  buildAccess(input: SignInput): CdnAccessInfo {
    const baseUrlOverrides = buildBaseUrlOverrides(this.cdnOrigin, input.coverage);

    if (this.opts.transport === 'header') {
      // Global signature over the doc-wide prefix. Per-resource scope
      // can't be enforced via a single header — see file-level docs.
      const docPrefix = `/v1/docs/${input.docId}/`;
      const { sig, nonce, expires } = signCustomHmacToken(this.secret, docPrefix, input.expiresAt);
      return {
        adapter: 'custom-hmac',
        expiresAt: input.expiresAt,
        cache: { scope: 'edge-shared', immutableVersionedReads: true },
        baseUrlOverrides,
        authHeader: {
          name: 'X-EmbedPDF-CDN-Signature',
          value: `v1.${expires}.${nonce}.${sig}`,
        },
        signedQueryParams: null,
        signedCookies: null,
        signedPathPolicies: null,
      };
    }

    // query transport — per-prefix signing. Each granted prefix gets
    // its own (sig, expires, nonce) so the edge can verify scope
    // narrowly.
    const signedPathPolicies = input.coverage.map((entry) => {
      const { sig, nonce, expires } = signCustomHmacToken(
        this.secret,
        entry.pathPrefix,
        input.expiresAt,
      );
      return {
        pathPrefix: entry.pathPrefix,
        queryParams: {
          cdn_sig: sig,
          cdn_exp: String(expires),
          cdn_nonce: nonce,
        },
      };
    });
    return {
      adapter: 'custom-hmac',
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
    return { adapter: 'custom-hmac', id: '', submittedAt: Date.now(), status: 'no-op' };
  }
}

/**
 * Pure signing: `sig = base64url(hmac-sha256(secret, path + expires + nonce))`.
 * Exported for testing — the function is deterministic given a nonce.
 */
export function signCustomHmacToken(
  secret: string,
  path: string,
  expiresAt: number,
  nonceBytes?: Buffer,
): { sig: string; nonce: string; expires: number } {
  const nonce = base64url(nonceBytes ?? randomBytes(16));
  const message = `${path}${expiresAt}${nonce}`;
  const sig = base64url(hmacSha256(secret, message));
  return { sig, nonce, expires: expiresAt };
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
