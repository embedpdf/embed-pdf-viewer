/**
 * Single source of truth mapping every CDN-relevant read resource to:
 *   - its URL path pattern (with glob wildcards for CDN signing)
 *   - the capability requirement that gates it
 *   - whether it's CDN-cacheable
 *   - whether the route is origin-only or versioned-read
 *
 * Consumed by:
 *   - server route guards via `requireResource(req, docId, id, pdfBits)`
 *   - the CDN signer to determine which path prefixes to cover for a token
 *   - documentation generators
 *
 * NOTE: only READ resources go in this table. Mutation routes
 * (POST/PATCH/DELETE) use collab scopes with target lookup and don't
 * fit a single capability requirement. /access is also NOT in the
 * table — it's a session-establishment POST that performs its own
 * doc-access check without requiring any capability.
 */

import type { DocCapability, PdfBits } from '../auth/scope';
import { checkAnyCapability, checkCapability } from '../auth/scope';

/**
 * Canonical id for every read resource the server exposes.
 *
 * Adding a new resource:
 *   1. Add the id to this union
 *   2. Add a `DOC_RESOURCES` entry
 *   3. Update the route handler to call `requireResource(req, docId, '<id>', pdfBits)`
 *   4. CDN signer automatically considers it
 */
export type DocResourceId =
  | 'head'
  | 'manifest'
  | 'page-render'
  // Plane-prefix rule: annotated renders are their OWN family — they depend
  // on content+annotations while `/render/pages/` depends on content alone,
  // and edge grants see only prefixes, so the dependency set must be
  // visible in the path.
  | 'page-render-annotated'
  | 'page-text'
  | 'page-geometry'
  // Plane-scope model: doc-level shared variants, one per plane-dependent
  // read family. Each resolves at the base view while the planes it depends
  // on are inherited — see the RESOURCE_PLANES map in wire/cdn/coverage.ts.
  | 'page-annotations'
  | 'layout'
  | 'metadata'
  | 'actions'
  | 'attachments'
  | 'attachment-files'
  // Layer-scoped variants of the page resources. Same capability
  // gates as their doc-level cousins (the layer just provides a
  // possibly-divergent VIEW of the underlying page content — e.g.
  // server-side redactions in the future). Cataloguing both shapes
  // means the CDN signer covers the prefixes the SDK actually
  // requests. See ADR-002 / paths-v2 design for the doc-vs-layer
  // split rationale.
  | 'layer-manifest'
  | 'layer-layout'
  | 'layer-metadata'
  | 'layer-actions'
  | 'layer-page-render'
  // Layer twin of `page-render-annotated`: annotatedness is path-only at
  // BOTH tiers (uniform grammar), even though layer grants don't need the
  // distinction — see the token/path law in wire/paths.ts.
  | 'layer-page-render-annotated'
  | 'layer-page-text'
  | 'layer-page-geometry'
  // Search slices, one resource per PERMISSION TIER: rects-only results
  // vs snippet-carrying results live under distinct path prefixes, so a
  // CDN credential for one can never authorize (or cache-hit) the other.
  | 'layer-search-rects'
  | 'layer-search-full'
  | 'annotations-read'
  // Attachments, split by permission tier under DISTINCT prefixes (the
  // search-rects/search-full rule): the metadata listing rides the base
  // read capability, while decoded file bytes egress content and gate on
  // the download capability — an edge credential for the listing prefix
  // must never authorize the byte prefix.
  | 'layer-attachments'
  | 'layer-attachment-files'
  | 'download-current'
  | 'download-versioned';

/**
 * 'origin' — unversioned URL, response can change over time. CDN must
 * not cache (the bytes are not immutable). Routed straight to origin
 * with the JWT bearer.
 *
 * 'versioned-read' — URL is content-addressed via `@<token>`. Response
 * is immutable for the lifetime of the version. Safe to cache forever
 * at the CDN edge.
 */
export type RouteKind = 'origin' | 'versioned-read';

/**
 * Capability requirement attached to a resource. Three shapes:
 *   - `single` — one capability gates the resource
 *   - `any`    — any one of N capabilities gates the resource
 *               (used by /text and /geometry which accept either the
 *                copy/select scope OR the future search scope)
 *   - `all`    — every one of N capabilities is required
 *               (used by /search/full: a snippet IS extracted text, so
 *                the search scope alone is not enough — the copy denial
 *                must hold here too)
 */
export type CapabilityRequirement =
  | { kind: 'single'; capability: DocCapability }
  | { kind: 'any'; capabilities: ReadonlyArray<DocCapability> }
  | { kind: 'all'; capabilities: ReadonlyArray<DocCapability> };

export interface DocResourceDescriptor {
  /** Stable id used by route guards and the CDN signer. */
  id: DocResourceId;
  /**
   * Display pattern with `{docId}` / `{layerName}` placeholders for
   * docs + telemetry. Use {@link DocResourceDescriptor.resolvePathPattern}
   * to get a concrete pattern with values filled in.
   */
  pathPattern: string;
  /**
   * Concrete CDN path pattern with `*` wildcards. Used by adapters
   * that do explicit pattern matching at the edge (CloudFront via
   * Resource globs). For path prefixes with no layer component,
   * `layerName` is ignored.
   */
  resolvePathPattern(docId: string, layerName?: string): string;
  /**
   * Display prefix with `{docId}` / `{layerName}` placeholders. The
   * literal path-prefix the CDN signs for this resource — by design,
   * each resource type has its OWN distinct prefix, so a token
   * signed at this prefix authorizes only this resource type at the
   * edge (works on prefix-matching CDNs like Bunny / Cloud CDN /
   * Azure FD with no extra cleverness).
   */
  pathPrefix: string;
  /**
   * Concrete path prefix the CDN signer uses. The literal string
   * `pathPattern` would have *before* the first `*` wildcard — but
   * stored explicitly here rather than derived so future pattern
   * syntax changes can't accidentally break CDN security.
   *
   * For resources with no layer component, `layerName` is ignored.
   */
  resolvePathPrefix(docId: string, layerName?: string): string;
  /** What capability (or set) is needed to access this resource. */
  requirement: CapabilityRequirement;
  /** Versioned-immutable vs. unversioned-mutable. */
  routeKind: RouteKind;
  /**
   * Can the CDN sign coverage for this resource? Mutable/unversioned
   * resources (head, current download) are always false even though
   * they're routed via origin.
   */
  cdnCacheable: boolean;
}

/**
 * URL layout (paths v2): each resource type lives at a distinct path
 * prefix so prefix-matching CDNs (Bunny, Cloud CDN, Azure FD) can
 * enforce per-resource scope at the edge. See wire/paths.ts for the
 * full shape and rationale.
 */
export const DOC_RESOURCES: Readonly<Record<DocResourceId, DocResourceDescriptor>> = {
  head: {
    id: 'head',
    pathPattern: '/v1/docs/{docId}/head',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/head`,
    pathPrefix: '/v1/docs/{docId}/head',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/head`,
    requirement: { kind: 'single', capability: 'doc.open' },
    routeKind: 'origin',
    cdnCacheable: false,
  },
  manifest: {
    id: 'manifest',
    pathPattern: '/v1/docs/{docId}/manifest@*',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/manifest@*`,
    pathPrefix: '/v1/docs/{docId}/manifest@',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/manifest@`,
    requirement: { kind: 'single', capability: 'doc.open' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-manifest': {
    id: 'layer-manifest',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/manifest@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/manifest@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/manifest@',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/manifest@`,
    requirement: { kind: 'single', capability: 'doc.open' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'page-render': {
    id: 'page-render',
    pathPattern: '/v1/docs/{docId}/render/pages/*/data@*',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/render/pages/*/data@*`,
    pathPrefix: '/v1/docs/{docId}/render/pages/',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/render/pages/`,
    requirement: { kind: 'single', capability: 'doc.render' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'page-render-annotated': {
    id: 'page-render-annotated',
    pathPattern: '/v1/docs/{docId}/render/annotated/pages/*/data@*',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/render/annotated/pages/*/data@*`,
    pathPrefix: '/v1/docs/{docId}/render/annotated/pages/',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/render/annotated/pages/`,
    // Same capability tier as `page-render` — the split is about PLANE
    // dependencies (content+annotations vs content), not permissions.
    requirement: { kind: 'single', capability: 'doc.render' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'page-annotations': {
    id: 'page-annotations',
    pathPattern: '/v1/docs/{docId}/annotations/pages/*/items@*',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/annotations/pages/*/items@*`,
    // Prefix deliberately covers the `appearances@` sibling too, mirroring
    // the layer-scoped `annotations-read` rule: reading an annotation lets
    // you see its rendered appearance.
    pathPrefix: '/v1/docs/{docId}/annotations/pages/',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/annotations/pages/`,
    requirement: { kind: 'single', capability: 'doc.annotate.read' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  layout: {
    id: 'layout',
    pathPattern: '/v1/docs/{docId}/layout@*',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/layout@*`,
    pathPrefix: '/v1/docs/{docId}/layout@',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/layout@`,
    requirement: { kind: 'single', capability: 'doc.open' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  metadata: {
    id: 'metadata',
    pathPattern: '/v1/docs/{docId}/metadata@*',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/metadata@*`,
    pathPrefix: '/v1/docs/{docId}/metadata@',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/metadata@`,
    requirement: { kind: 'single', capability: 'doc.open' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  actions: {
    id: 'actions',
    pathPattern: '/v1/docs/{docId}/actions@*',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/actions@*`,
    pathPrefix: '/v1/docs/{docId}/actions@',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/actions@`,
    requirement: { kind: 'single', capability: 'doc.open' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-layout': {
    id: 'layer-layout',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/layout@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/layout@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/layout@',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/layout@`,
    // Geometry is the same session-level read as the manifest; gate it
    // behind `doc.open` just like `layer-manifest`.
    requirement: { kind: 'single', capability: 'doc.open' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-metadata': {
    id: 'layer-metadata',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/metadata@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/metadata@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/metadata@',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/metadata@`,
    // Metadata is the same session-level read as the manifest; gate it
    // behind `doc.open` just like `layer-manifest` / `layer-layout`.
    requirement: { kind: 'single', capability: 'doc.open' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-actions': {
    id: 'layer-actions',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/actions@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/actions@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/actions@',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/actions@`,
    requirement: { kind: 'single', capability: 'doc.open' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  attachments: {
    id: 'attachments',
    pathPattern: '/v1/docs/{docId}/attachments@*',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/attachments@*`,
    pathPrefix: '/v1/docs/{docId}/attachments@',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/attachments@`,
    requirement: { kind: 'single', capability: 'doc.open' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'attachment-files': {
    id: 'attachment-files',
    pathPattern: '/v1/docs/{docId}/attachment-files/*',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/attachment-files/*`,
    pathPrefix: '/v1/docs/{docId}/attachment-files/',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/attachment-files/`,
    // Same tier split as the layer variants: the byte leaf is a stronger
    // capability than the metadata listing.
    requirement: { kind: 'single', capability: 'doc.download' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-attachments': {
    id: 'layer-attachments',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/attachments@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/attachments@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/attachments@',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/attachments@`,
    requirement: { kind: 'single', capability: 'doc.open' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-attachment-files': {
    id: 'layer-attachment-files',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/attachment-files/*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/attachment-files/*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/attachment-files/',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/attachment-files/`,
    requirement: { kind: 'single', capability: 'doc.download' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-page-render': {
    id: 'layer-page-render',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/render/pages/*/data@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/render/pages/*/data@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/render/pages/',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/render/pages/`,
    requirement: { kind: 'single', capability: 'doc.render' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-page-render-annotated': {
    id: 'layer-page-render-annotated',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/render/annotated/pages/*/data@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/render/annotated/pages/*/data@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/render/annotated/pages/',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/render/annotated/pages/`,
    requirement: { kind: 'single', capability: 'doc.render' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'page-text': {
    id: 'page-text',
    pathPattern: '/v1/docs/{docId}/text/pages/*/data@*',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/text/pages/*/data@*`,
    pathPrefix: '/v1/docs/{docId}/text/pages/',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/text/pages/`,
    // Only doc.text.copy gates /text. doc.text.search is reserved for a
    // future dedicated /search endpoint and intentionally does NOT
    // grant /text access here.
    requirement: { kind: 'single', capability: 'doc.text.copy' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-page-text': {
    id: 'layer-page-text',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/text/pages/*/data@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/text/pages/*/data@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/text/pages/',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/text/pages/`,
    requirement: { kind: 'single', capability: 'doc.text.copy' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'page-geometry': {
    id: 'page-geometry',
    pathPattern: '/v1/docs/{docId}/geometry/pages/*/data@*',
    resolvePathPattern: (docId) => `/v1/docs/${docId}/geometry/pages/*/data@*`,
    pathPrefix: '/v1/docs/{docId}/geometry/pages/',
    resolvePathPrefix: (docId) => `/v1/docs/${docId}/geometry/pages/`,
    // Same logic as /text: search is reserved for a future endpoint.
    requirement: { kind: 'single', capability: 'doc.text.select' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-page-geometry': {
    id: 'layer-page-geometry',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/geometry/pages/*/data@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/geometry/pages/*/data@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/geometry/pages/',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/geometry/pages/`,
    requirement: { kind: 'single', capability: 'doc.text.select' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-search-rects': {
    id: 'layer-search-rects',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/search/rects/data@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/search/rects/data@*`,
    // Prefix ends at `data@`: the CDN credential covers ONLY the
    // versioned, immutable form — the unversioned `data` URL is
    // origin-routed and never edge-cached.
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/search/rects/data@',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/search/rects/data@`,
    requirement: { kind: 'single', capability: 'doc.text.search' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'layer-search-full': {
    id: 'layer-search-full',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/search/full/data@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/search/full/data@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/search/full/data@',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/search/full/data@`,
    requirement: { kind: 'all', capabilities: ['doc.text.search', 'doc.text.copy'] },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'annotations-read': {
    id: 'annotations-read',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/annotations/pages/*/items@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/annotations/pages/*/items@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/annotations/pages/',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/annotations/pages/`,
    requirement: { kind: 'single', capability: 'doc.annotate.read' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
  'download-current': {
    id: 'download-current',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/download',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/download`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/download',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/download`,
    requirement: { kind: 'single', capability: 'doc.download' },
    routeKind: 'origin',
    cdnCacheable: false,
  },
  'download-versioned': {
    id: 'download-versioned',
    pathPattern: '/v1/docs/{docId}/layers/{layerName}/download@*',
    resolvePathPattern: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/download@*`,
    pathPrefix: '/v1/docs/{docId}/layers/{layerName}/download@',
    resolvePathPrefix: (docId, layerName = 'default') =>
      `/v1/docs/${docId}/layers/${layerName}/download@`,
    requirement: { kind: 'single', capability: 'doc.download' },
    routeKind: 'versioned-read',
    cdnCacheable: true,
  },
};

/**
 * True iff the scope grants access to the named resource.
 *
 * Looks up the resource descriptor, then dispatches to
 * `checkCapability` or `checkAnyCapability` based on the requirement
 * shape. Used by both server route guards and the CDN signer.
 */
export function checkResourceAccess(
  resourceId: DocResourceId,
  rawScope: ReadonlyArray<string>,
  pdfBits: PdfBits,
): boolean {
  const r = DOC_RESOURCES[resourceId];
  switch (r.requirement.kind) {
    case 'single':
      return checkCapability(r.requirement.capability, rawScope, pdfBits);
    case 'any':
      return checkAnyCapability(r.requirement.capabilities, rawScope, pdfBits);
    case 'all':
      return r.requirement.capabilities.every((cap) => checkCapability(cap, rawScope, pdfBits));
  }
}

// CDN-specific helpers (cdnCoverageForScope, CdnCoverageEntry,
// applyCdnAccess, resolveResourceIdForPath) live under ./cdn/. They
// build on DOC_RESOURCES + checkResourceAccess but are intentionally
// segregated so cloud-only consumers don't accidentally pull general
// route-guard code via the CDN module, and vice versa.
