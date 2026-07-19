/**
 * Per-scope CDN coverage enumeration.
 *
 * Filters DOC_RESOURCES to the cacheable entries the caller's scope
 * grants, returning both URL projections every signer family needs:
 *   - `pathPattern`  — for glob-matching signers (CloudFront)
 *   - `pathPrefix`   — for prefix-matching signers (Bunny / Cloud CDN /
 *                       Azure FD / custom HMAC)
 *
 * Consumed by:
 *   - the server's /access route, which feeds it into the CDN signer
 *   - tests that pin per-scope coverage
 *
 * Never imported by engine-local — this is HTTP-wire territory.
 */

import type { PdfBits } from '../../auth/scope';
import { checkResourceAccess, DOC_RESOURCES, type DocResourceId } from '../resources';

/**
 * One CDN-coverage entry: the resource id plus both projections of its
 * URL — the wildcard `pathPattern` (for pattern-matching CDN signers
 * like CloudFront) and the literal `pathPrefix` (for prefix-matching
 * CDN signers like Bunny / Cloud CDN / Azure FD / custom HMAC).
 *
 * Each entry corresponds to one cacheable resource the caller's
 * scope grants access to. Both projections are pre-resolved with the
 * concrete `docId` / `layerName` filled in.
 */
export interface CdnCoverageEntry {
  readonly resourceId: DocResourceId;
  /** Resolved CDN path pattern with `*` wildcards (for glob signers). */
  readonly pathPattern: string;
  /** Resolved literal path prefix (for prefix-match signers). */
  readonly pathPrefix: string;
}

/**
 * Enumerate the CDN-cacheable resources the scope can access. Returns
 * one {@link CdnCoverageEntry} per granted cacheable resource, carrying
 * both the pattern and the prefix so each adapter can pick the
 * projection it needs.
 *
 * Resources that are not cacheable (head, download-current) are
 * filtered out automatically — they're still gated by their
 * `requirement` at the origin route, but the CDN never gets a
 * credential for them.
 *
 * The URL restructure (paths v2) guarantees each cacheable resource
 * type has a distinct prefix, so prefix-matching adapters get
 * per-resource scope enforcement at the edge — a Bunny token signed
 * at `/v1/docs/{id}/render/pages/` can only authorize render bytes,
 * never text or annotations.
 */
export function cdnCoverageForScope(
  rawScope: ReadonlyArray<string>,
  pdfBits: PdfBits,
  context: { docId: string; layerName?: string },
): ReadonlyArray<CdnCoverageEntry> {
  const out: CdnCoverageEntry[] = [];
  for (const id of Object.keys(DOC_RESOURCES) as DocResourceId[]) {
    const r = DOC_RESOURCES[id];
    if (!r.cdnCacheable) continue;
    if (!checkResourceAccess(id, rawScope, pdfBits)) continue;
    out.push({
      resourceId: id,
      pathPattern: r.resolvePathPattern(context.docId, context.layerName),
      pathPrefix: r.resolvePathPrefix(context.docId, context.layerName),
    });
  }
  return out;
}
