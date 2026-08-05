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
import type { LayerScopePlane, LayerScopes } from '../../dto/LayerScopes';
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
/**
 * Plane map: the planes each DOC-LEVEL shared resource depends on. A
 * layer token's edge credential covers a resource's prefix iff EVERY listed
 * plane is inherited (`'base'`) in the caller's scopes — the same condition
 * the origin guard enforces (origin is the truth; this grant is the
 * TTL-bounded optimization). Resources absent from this map (head, manifest,
 * every layer-scoped resource) are not plane-gated.
 *
 * `attachment-files` deliberately lists only `attachments` even though its
 * prefix also serves FileAttachment-annotation bytes (an `annotations`-plane
 * read): the origin guard on that route additionally requires `annotations`
 * inherited, and withholding the whole prefix on annotation divergence would
 * break plain attachment-file sharing for the most common divergence. The
 * residual is a warm-edge window bounded by the grant TTL — the same class
 * as every edge grant.
 */
const RESOURCE_PLANES: Partial<Record<DocResourceId, readonly LayerScopePlane[]>> = {
  'page-render': ['content'],
  'page-text': ['content'],
  'page-geometry': ['content'],
  'page-render-annotated': ['content', 'annotations'],
  'page-annotations': ['annotations'],
  layout: ['layout'],
  metadata: ['metadata'],
  actions: ['actions'],
  attachments: ['attachments'],
  'attachment-files': ['attachments'],
};

export function cdnCoverageForScope(
  rawScope: ReadonlyArray<string>,
  pdfBits: PdfBits,
  context: {
    docId: string;
    layerName?: string;
    /**
     * Plane scopes of the caller's pinned layer. A doc-level shared
     * resource's prefix is covered iff every plane it depends on is
     * inherited (`'base'`). Omitted = no layer in play (tenant tokens) —
     * everything the capability scope allows is granted.
     */
    scopes?: LayerScopes;
  },
): ReadonlyArray<CdnCoverageEntry> {
  const out: CdnCoverageEntry[] = [];
  const scopes = context.scopes;
  for (const id of Object.keys(DOC_RESOURCES) as DocResourceId[]) {
    const r = DOC_RESOURCES[id];
    if (!r.cdnCacheable) continue;
    const planes = RESOURCE_PLANES[id];
    if (planes && scopes && planes.some((plane) => scopes[plane] === 'layer')) continue;
    if (!checkResourceAccess(id, rawScope, pdfBits)) continue;
    out.push({
      resourceId: id,
      pathPattern: r.resolvePathPattern(context.docId, context.layerName),
      pathPrefix: r.resolvePathPrefix(context.docId, context.layerName),
    });
  }
  return out;
}
