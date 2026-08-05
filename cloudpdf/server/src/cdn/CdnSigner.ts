/**
 * The CdnSigner interface — single contract every CDN adapter implements.
 * Lives in `server/src/cdn/` because all adapter implementations need
 * cloud-vendor SDKs (which engine-core can't depend on). The
 * corresponding wire shape `CdnAccessInfo` lives in engine-core
 * because the SDK consumes it.
 *
 * Two operations:
 *   - buildAccess: pure / synchronous. Called on every /access response.
 *     Translates "this caller, this scope, this expiry" into the
 *     per-caller signed URLs / cookies / query params the client uses
 *     against the CDN edge.
 *   - purge: async. Called from delete paths (doc deletion, layer
 *     deletion) to scrub the CDN cache for privacy/cleanup. Each
 *     provider's API is async with different semantics (CloudFront
 *     takes minutes; Bunny is near-instant); the coordinator persists
 *     receipts and polls status for slow providers.
 *
 * `info` follows the unified adapter pattern — `kind` discriminator
 * plus public diagnostic fields (no secrets). Surfaced via
 * /v1/admin/status.
 */

import type { CdnAccessInfo, CdnAdapter } from '@embedpdf/engine-core/runtime';
import type { CdnCoverageEntry } from '@embedpdf/engine-core/wire';

export interface CdnSignerInfo {
  readonly kind: CdnAdapter;
  readonly [field: string]: unknown;
}

export interface SignInput {
  readonly tenantId: string;
  readonly docId: string;
  readonly layerName?: string;
  /**
   * Per-resource CDN coverage this caller's scope grants. One entry
   * per cacheable resource the scope can access. Each entry carries
   * both the wildcard `pathPattern` (for glob-matching signers like
   * CloudFront) and the literal `pathPrefix` (for prefix-matching
   * signers like Bunny / Cloud CDN / Azure FD / custom HMAC).
   *
   * Produced by `cdnCoverageForScope` from engine-core/wire. Adapters
   * sign each prefix (or the equivalent glob) and populate the
   * appropriate channels on `CdnAccessInfo`. `baseUrlOverrides` is
   * populated only for resourceIds in this list — never for resources
   * the scope doesn't grant.
   *
   * Prefix-matching signers populate one `signedPathPolicies` entry
   * per coverage entry, so a render token can't authorize text
   * requests at the edge (and vice versa) — the URL restructure
   * (paths v2) guarantees each resource lives at a distinct prefix.
   */
  readonly coverage: ReadonlyArray<CdnCoverageEntry>;
  /** Session expiry (epoch seconds). Signed URLs must not outlive the JWT. */
  readonly expiresAt: number;
  /** The server's public origin URL, e.g. `https://api.example.com`. */
  readonly originUrl: string;
}

export interface PurgeInput {
  readonly tenantId: string;
  /** Narrow to one doc — purge every CDN-cacheable path under `/v1/docs/:docId/`. */
  readonly docId?: string;
  /** Narrow further to one layer within a doc. */
  readonly layerName?: string;
  /** Explicit list of URL paths to purge — overrides the doc/layer narrowing. */
  readonly paths?: ReadonlyArray<string>;
}

export interface PurgeReceipt {
  readonly adapter: CdnAdapter;
  /** Provider-issued job/invalidation ID for follow-up status checks. */
  readonly id: string;
  /** Epoch ms when the purge was submitted to the provider. */
  readonly submittedAt: number;
  /**
   * - `no-op`     : adapter doesn't purge (e.g., None)
   * - `pending`   : provider accepted the job, propagation in progress
   * - `completed` : provider confirmed completion (synchronous purges only)
   * - `failed`    : provider rejected or surfaced an error
   */
  readonly status: 'pending' | 'completed' | 'failed' | 'no-op';
}

export interface CdnSigner {
  readonly info: CdnSignerInfo;
  /**
   * Build the per-caller CDN access bits for one /access response.
   * Pure, synchronous, no network. Called on every /access — must be
   * fast.
   */
  buildAccess(input: SignInput): CdnAccessInfo;
  /**
   * Purge cache for the given scope. Async — network call to the
   * provider. Adapters that don't support purge return a `no-op`
   * receipt; the coordinator records that and moves on.
   */
  purge(input: PurgeInput): Promise<PurgeReceipt>;
}
