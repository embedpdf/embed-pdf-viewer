/**
 * Built-in no-CDN signer. Returns the same `/access` shape the server
 * shipped before the CDN adapter family existed — origin reads only,
 * browser-private cache, no signing channels populated.
 *
 * Used for single-server deployments, local dev, and as the default
 * when `CLOUDPDF_CDN_KIND` is unset. Purge is a no-op.
 */

import type { CdnAccessInfo } from '@embedpdf/engine-core/runtime';

import type { CdnSigner, PurgeInput, PurgeReceipt, SignInput } from '../CdnSigner';

export class NoneCdnSigner implements CdnSigner {
  readonly info = { kind: 'none' as const };

  buildAccess(input: SignInput): CdnAccessInfo {
    return {
      adapter: 'none',
      expiresAt: input.expiresAt,
      cache: {
        scope: 'browser-private',
        immutableVersionedReads: true,
      },
      baseUrlOverrides: null,
      authHeader: null,
      signedQueryParams: null,
      signedCookies: null,
      signedPathPolicies: null,
    };
  }

  async purge(_input: PurgeInput): Promise<PurgeReceipt> {
    return {
      adapter: 'none',
      id: '',
      submittedAt: Date.now(),
      status: 'no-op',
    };
  }
}
