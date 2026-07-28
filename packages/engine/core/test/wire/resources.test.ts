import { describe, expect, it } from 'vitest';
import { decodePdfBits, PDF_BITS } from '../../src/auth/scope';
import { checkResourceAccess, DOC_RESOURCES, type DocResourceId } from '../../src/wire/resources';
import { cdnCoverageForScope } from '../../src/wire/cdn/coverage';

const NO_BITS = decodePdfBits(null);
const BIT5 = decodePdfBits(PDF_BITS.COPY);
const BIT6 = decodePdfBits(PDF_BITS.ANNOTATE_FILL);

describe('DOC_RESOURCES — structural invariants', () => {
  it('every entry has matching id and key', () => {
    for (const [key, descriptor] of Object.entries(DOC_RESOURCES)) {
      expect(descriptor.id).toBe(key);
    }
  });

  it('every entry has a non-empty path pattern', () => {
    for (const r of Object.values(DOC_RESOURCES)) {
      expect(r.pathPattern.length).toBeGreaterThan(0);
      expect(r.pathPattern).toMatch(/^\/v1\/docs\//);
    }
  });

  it('resolvePathPattern substitutes docId and layerName', () => {
    for (const r of Object.values(DOC_RESOURCES)) {
      const resolved = r.resolvePathPattern('doc_123', 'mylayer');
      expect(resolved).toContain('doc_123');
      expect(resolved).not.toContain('{docId}');
      expect(resolved).not.toContain('{layerName}');
    }
  });

  it('origin routes are not cacheable', () => {
    for (const r of Object.values(DOC_RESOURCES)) {
      if (r.routeKind === 'origin') expect(r.cdnCacheable).toBe(false);
    }
  });

  it('head and download-current are origin/not-cacheable', () => {
    expect(DOC_RESOURCES.head.routeKind).toBe('origin');
    expect(DOC_RESOURCES.head.cdnCacheable).toBe(false);
    expect(DOC_RESOURCES['download-current'].routeKind).toBe('origin');
    expect(DOC_RESOURCES['download-current'].cdnCacheable).toBe(false);
  });

  it('manifest, page-*, layer-page-*, layer-manifest, annotations-read, download-versioned are versioned/cacheable', () => {
    const cacheable: DocResourceId[] = [
      'manifest',
      'layer-manifest',
      'page-render',
      'layer-page-render',
      'page-text',
      'layer-page-text',
      'page-geometry',
      'layer-page-geometry',
      'annotations-read',
      'layer-attachments',
      'layer-attachment-files',
      'download-versioned',
    ];
    for (const id of cacheable) {
      expect(DOC_RESOURCES[id].routeKind).toBe('versioned-read');
      expect(DOC_RESOURCES[id].cdnCacheable).toBe(true);
    }
  });

  it('layer-page-* variants share the capability gate of their doc-level cousin', () => {
    expect(DOC_RESOURCES['layer-manifest'].requirement).toEqual(DOC_RESOURCES.manifest.requirement);
    expect(DOC_RESOURCES['layer-page-render'].requirement).toEqual(
      DOC_RESOURCES['page-render'].requirement,
    );
    expect(DOC_RESOURCES['layer-page-text'].requirement).toEqual(
      DOC_RESOURCES['page-text'].requirement,
    );
    expect(DOC_RESOURCES['layer-page-geometry'].requirement).toEqual(
      DOC_RESOURCES['page-geometry'].requirement,
    );
  });
});

describe('DOC_RESOURCES — capability mapping', () => {
  it('head requires doc.open', () => {
    expect(DOC_RESOURCES.head.requirement).toEqual({
      kind: 'single',
      capability: 'doc.open',
    });
  });

  it('manifest requires doc.open', () => {
    expect(DOC_RESOURCES.manifest.requirement).toEqual({
      kind: 'single',
      capability: 'doc.open',
    });
  });

  it('page-render requires doc.render', () => {
    expect(DOC_RESOURCES['page-render'].requirement).toEqual({
      kind: 'single',
      capability: 'doc.render',
    });
  });

  it('page-text requires doc.text.copy (NOT doc.text.search)', () => {
    expect(DOC_RESOURCES['page-text'].requirement).toEqual({
      kind: 'single',
      capability: 'doc.text.copy',
    });
  });

  it('page-geometry requires doc.text.select (NOT doc.text.search)', () => {
    expect(DOC_RESOURCES['page-geometry'].requirement).toEqual({
      kind: 'single',
      capability: 'doc.text.select',
    });
  });

  it('annotations-read requires doc.annotate.read', () => {
    expect(DOC_RESOURCES['annotations-read'].requirement).toEqual({
      kind: 'single',
      capability: 'doc.annotate.read',
    });
  });

  it('both download variants require doc.download', () => {
    expect(DOC_RESOURCES['download-current'].requirement).toEqual({
      kind: 'single',
      capability: 'doc.download',
    });
    expect(DOC_RESOURCES['download-versioned'].requirement).toEqual({
      kind: 'single',
      capability: 'doc.download',
    });
  });
});

describe('checkResourceAccess', () => {
  it('wildcard scope grants every resource', () => {
    for (const id of Object.keys(DOC_RESOURCES) as DocResourceId[]) {
      expect(checkResourceAccess(id, ['*'], NO_BITS)).toBe(true);
    }
  });

  it('empty scope grants nothing (deny by default)', () => {
    for (const id of Object.keys(DOC_RESOURCES) as DocResourceId[]) {
      expect(checkResourceAccess(id, [], NO_BITS)).toBe(false);
    }
  });

  it('explicit doc.open grants head and manifest but not page-render', () => {
    expect(checkResourceAccess('head', ['doc.open'], NO_BITS)).toBe(true);
    expect(checkResourceAccess('manifest', ['doc.open'], NO_BITS)).toBe(true);
    expect(checkResourceAccess('page-render', ['doc.open'], NO_BITS)).toBe(false);
  });

  it('pdf.permissions + bit5 grants page-text and page-geometry', () => {
    expect(checkResourceAccess('page-text', ['pdf.permissions'], BIT5)).toBe(true);
    expect(checkResourceAccess('page-geometry', ['pdf.permissions'], BIT5)).toBe(true);
  });

  it('pdf.permissions always grants head + manifest + page-render', () => {
    // doc.open and doc.render are always-on under pdf.permissions
    expect(checkResourceAccess('head', ['pdf.permissions'], NO_BITS)).toBe(true);
    expect(checkResourceAccess('manifest', ['pdf.permissions'], NO_BITS)).toBe(true);
    expect(checkResourceAccess('page-render', ['pdf.permissions'], NO_BITS)).toBe(true);
  });

  it('pdf.permissions does NOT grant cloud-only resources without explicit cap', () => {
    expect(checkResourceAccess('download-current', ['pdf.permissions'], BIT5)).toBe(false);
    expect(checkResourceAccess('download-versioned', ['pdf.permissions'], BIT5)).toBe(false);
  });

  it('annotations-read granted via doc.annotate.read alone', () => {
    expect(checkResourceAccess('annotations-read', ['doc.annotate.read'], NO_BITS)).toBe(true);
  });

  it('annotations-read granted via doc.annotate.modify (implication)', () => {
    expect(checkResourceAccess('annotations-read', ['doc.annotate.modify'], NO_BITS)).toBe(true);
  });

  it('annotations-read granted via collab scope (implication)', () => {
    expect(checkResourceAccess('annotations-read', ['annotations:update:self'], NO_BITS)).toBe(
      true,
    );
  });

  it('annotations-read granted via pdf.permissions + bit6', () => {
    expect(checkResourceAccess('annotations-read', ['pdf.permissions'], BIT6)).toBe(true);
  });
});

describe('cdnCoverageForScope', () => {
  it('returns empty for empty scope', () => {
    expect(cdnCoverageForScope([], NO_BITS, { docId: 'doc_1' })).toEqual([]);
  });

  it('wildcard scope covers every cacheable resource', () => {
    const coverage = cdnCoverageForScope(['*'], NO_BITS, {
      docId: 'doc_1',
      layerName: 'L1',
    });
    const expectedIds = Object.values(DOC_RESOURCES)
      .filter((r) => r.cdnCacheable)
      .map((r) => r.id);
    expect(new Set(coverage.map((e) => e.resourceId))).toEqual(new Set(expectedIds));
  });

  it('every entry carries both pathPattern and pathPrefix', () => {
    const coverage = cdnCoverageForScope(['*'], NO_BITS, { docId: 'doc_1', layerName: 'L1' });
    for (const entry of coverage) {
      const descriptor = DOC_RESOURCES[entry.resourceId];
      expect(entry.pathPattern).toBe(descriptor.resolvePathPattern('doc_1', 'L1'));
      expect(entry.pathPrefix).toBe(descriptor.resolvePathPrefix('doc_1', 'L1'));
    }
  });

  it('never includes head or download-current', () => {
    const coverage = cdnCoverageForScope(['*'], NO_BITS, { docId: 'doc_1' });
    expect(coverage.some((e) => e.resourceId === 'head')).toBe(false);
    expect(coverage.some((e) => e.resourceId === 'download-current')).toBe(false);
  });

  const ALL_BASE = {
    content: 'base',
    annotations: 'base',
    layout: 'base',
    attachments: 'base',
    metadata: 'base',
    actions: 'base',
  } as const;

  it('scopes: an owned plane withholds exactly the doc-level resources depending on it (WS2b)', () => {
    const ids = (c: ReturnType<typeof cdnCoverageForScope>) => new Set(c.map((e) => e.resourceId));
    const shared = ids(
      cdnCoverageForScope(['*'], NO_BITS, {
        docId: 'doc_1',
        layerName: 'L1',
        scopes: { ...ALL_BASE },
      }),
    );
    for (const id of [
      'page-render',
      'page-render-annotated',
      'page-annotations',
      'layout',
      'metadata',
      'actions',
      'attachments',
      'attachment-files',
    ] as const) {
      expect(shared.has(id)).toBe(true);
    }
    // Content owned (redaction apply / page surgery): the content trio AND
    // the annotated family (content+annotations) go; annotation-plane and
    // attachments-plane resources stay — a redacted layer still shares the
    // base annotations and attachments it never touched.
    const contentOwned = ids(
      cdnCoverageForScope(['*'], NO_BITS, {
        docId: 'doc_1',
        layerName: 'L1',
        scopes: { ...ALL_BASE, content: 'layer' },
      }),
    );
    for (const id of [
      'page-render',
      'page-text',
      'page-geometry',
      'page-render-annotated',
    ] as const) {
      expect(contentOwned.has(id)).toBe(false);
    }
    expect(contentOwned.has('page-annotations')).toBe(true);
    expect(contentOwned.has('attachments')).toBe(true);
    expect(contentOwned.has('layout')).toBe(true);
    // Layer-scoped variants are never plane-gated — a diverged layer still
    // reads ITS OWN view.
    expect(contentOwned.has('layer-page-render')).toBe(true);
    expect(contentOwned.has('layer-page-text')).toBe(true);
    // Omitted scopes = tenant token / no layer in play: capability rules only.
    expect(ids(cdnCoverageForScope(['*'], NO_BITS, { docId: 'doc_1' })).has('page-render')).toBe(
      true,
    );
  });

  it('scopes: every plane is an independent axis (WS2b)', () => {
    const ids = (c: ReturnType<typeof cdnCoverageForScope>) => new Set(c.map((e) => e.resourceId));
    // Annotations owned: annotation lists + the annotated render family go;
    // the annotation-free content trio survives — this is the most common
    // divergence and it must not cost raster sharing.
    const annotationsOwned = ids(
      cdnCoverageForScope(['*'], NO_BITS, {
        docId: 'doc_1',
        layerName: 'L1',
        scopes: { ...ALL_BASE, annotations: 'layer' },
      }),
    );
    expect(annotationsOwned.has('page-annotations')).toBe(false);
    expect(annotationsOwned.has('page-render-annotated')).toBe(false);
    expect(annotationsOwned.has('page-render')).toBe(true);
    expect(annotationsOwned.has('attachments')).toBe(true);
    // attachment-files stays granted on annotation divergence BY DESIGN: the
    // FileAttachment-annotation byte route carries its own origin-side
    // annotations check; withholding the whole prefix would break plain
    // attachment-file sharing (see RESOURCE_PLANES in coverage.ts).
    expect(annotationsOwned.has('attachment-files')).toBe(true);

    const attachmentsOwned = ids(
      cdnCoverageForScope(['*'], NO_BITS, {
        docId: 'doc_1',
        layerName: 'L1',
        scopes: { ...ALL_BASE, attachments: 'layer' },
      }),
    );
    expect(attachmentsOwned.has('attachments')).toBe(false);
    expect(attachmentsOwned.has('attachment-files')).toBe(false);
    expect(attachmentsOwned.has('page-render')).toBe(true);
    expect(attachmentsOwned.has('layer-attachments')).toBe(true);

    // Layout owned (move/rotate): ONLY the layout leaf goes — normalized
    // render/text/geometry artifacts survive structural ops.
    const layoutOwned = ids(
      cdnCoverageForScope(['*'], NO_BITS, {
        docId: 'doc_1',
        layerName: 'L1',
        scopes: { ...ALL_BASE, layout: 'layer' },
      }),
    );
    expect(layoutOwned.has('layout')).toBe(false);
    expect(layoutOwned.has('page-render')).toBe(true);
    expect(layoutOwned.has('page-annotations')).toBe(true);

    const metadataOwned = ids(
      cdnCoverageForScope(['*'], NO_BITS, {
        docId: 'doc_1',
        layerName: 'L1',
        scopes: { ...ALL_BASE, metadata: 'layer' },
      }),
    );
    expect(metadataOwned.has('metadata')).toBe(false);
    expect(metadataOwned.has('page-render')).toBe(true);
  });

  it('a single capability scope covers both doc-level and layer-scoped variants gated by that capability', () => {
    // doc.render → page-render (doc-level) AND layer-page-render (layer-scoped).
    // Both share the same capability gate; both get signed so the CDN
    // covers whichever variant the SDK actually requests.
    const coverage = cdnCoverageForScope(['doc.render'], NO_BITS, { docId: 'doc_1' });
    expect(coverage).toEqual([
      {
        resourceId: 'page-render',
        pathPattern: '/v1/docs/doc_1/render/pages/*/data@*',
        pathPrefix: '/v1/docs/doc_1/render/pages/',
      },
      {
        resourceId: 'page-render-annotated',
        pathPattern: '/v1/docs/doc_1/render/annotated/pages/*/data@*',
        pathPrefix: '/v1/docs/doc_1/render/annotated/pages/',
      },
      {
        resourceId: 'layer-page-render',
        pathPattern: '/v1/docs/doc_1/layers/default/render/pages/*/data@*',
        pathPrefix: '/v1/docs/doc_1/layers/default/render/pages/',
      },
      {
        resourceId: 'layer-page-render-annotated',
        pathPattern: '/v1/docs/doc_1/layers/default/render/annotated/pages/*/data@*',
        pathPrefix: '/v1/docs/doc_1/layers/default/render/annotated/pages/',
      },
    ]);
  });

  it('layer-bearing entries use the supplied layerName', () => {
    const coverage = cdnCoverageForScope(['doc.annotate.read'], NO_BITS, {
      docId: 'doc_1',
      layerName: 'myLayer',
    });
    expect(coverage).toEqual([
      {
        resourceId: 'page-annotations',
        pathPattern: '/v1/docs/doc_1/annotations/pages/*/items@*',
        pathPrefix: '/v1/docs/doc_1/annotations/pages/',
      },
      {
        resourceId: 'annotations-read',
        pathPattern: '/v1/docs/doc_1/layers/myLayer/annotations/pages/*/items@*',
        pathPrefix: '/v1/docs/doc_1/layers/myLayer/annotations/pages/',
      },
    ]);
  });

  it('layer-bearing entries default to "default" when layerName is omitted', () => {
    const coverage = cdnCoverageForScope(['doc.annotate.read'], NO_BITS, { docId: 'doc_1' });
    expect(coverage).toEqual([
      {
        resourceId: 'page-annotations',
        pathPattern: '/v1/docs/doc_1/annotations/pages/*/items@*',
        pathPrefix: '/v1/docs/doc_1/annotations/pages/',
      },
      {
        resourceId: 'annotations-read',
        pathPattern: '/v1/docs/doc_1/layers/default/annotations/pages/*/items@*',
        pathPrefix: '/v1/docs/doc_1/layers/default/annotations/pages/',
      },
    ]);
  });

  it('pdf.permissions + bit5 + bit6 covers manifest, render, text, geometry, annotations (both doc-level and layer-scoped variants)', () => {
    const bits = decodePdfBits(PDF_BITS.COPY | PDF_BITS.ANNOTATE_FILL);
    const coverage = cdnCoverageForScope(['pdf.permissions'], bits, {
      docId: 'doc_1',
      layerName: 'default',
    });
    expect(new Set(coverage.map((e) => e.resourceId))).toEqual(
      new Set([
        'manifest',
        'layer-manifest',
        'layer-layout',
        'layer-metadata',
        'layer-actions',
        'page-render',
        'page-render-annotated',
        'layer-page-render',
        'layer-page-render-annotated',
        'page-text',
        'layer-page-text',
        'page-geometry',
        'layer-page-geometry',
        // bit 5 grants doc.text.{search,copy} → both search tiers.
        'layer-search-rects',
        'layer-search-full',
        'page-annotations',
        'annotations-read',
        // doc.open (session establishment) also covers the doc-level shared
        // families (WS2b plane model); attachment BYTES stay behind
        // doc.download.
        'layout',
        'metadata',
        'actions',
        'attachments',
        'layer-attachments',
      ]),
    );
    // download is cloud-only — not granted by pdf.permissions
    expect(coverage.some((e) => e.resourceId.includes('download'))).toBe(false);
  });

  it('omits non-cacheable resources even when granted (e.g. head)', () => {
    const coverage = cdnCoverageForScope(['doc.open'], NO_BITS, { docId: 'doc_1' });
    // head is granted by doc.open but cdnCacheable: false → omitted
    expect(coverage.some((e) => e.resourceId === 'head')).toBe(false);
    // manifest is cdnCacheable: true and granted → included
    expect(coverage.some((e) => e.resourceId === 'manifest')).toBe(true);
  });
});

describe('DOC_RESOURCES — pathPrefix invariants (anti-drift)', () => {
  it("every resource's pathPrefix is the literal-prefix of its pathPattern", () => {
    // The signer treats pathPrefix as the authority boundary for CDN
    // signing. If pathPattern and pathPrefix ever drift, the CDN
    // would authorize either too much (security gap) or too little
    // (broken cache). This test pins them together: pathPrefix must
    // equal pathPattern up to the first `*`.
    for (const r of Object.values(DOC_RESOURCES)) {
      const wildcardIdx = r.pathPattern.indexOf('*');
      const expectedPrefix =
        wildcardIdx === -1 ? r.pathPattern : r.pathPattern.slice(0, wildcardIdx);
      expect(r.pathPrefix, `pathPrefix drifted for ${r.id}`).toBe(expectedPrefix);
    }
  });

  it('resolvePathPrefix and resolvePathPattern produce values whose prefix relationship matches', () => {
    for (const r of Object.values(DOC_RESOURCES)) {
      const pattern = r.resolvePathPattern('doc_X', 'myLayer');
      const prefix = r.resolvePathPrefix('doc_X', 'myLayer');
      const wildcardIdx = pattern.indexOf('*');
      const derived = wildcardIdx === -1 ? pattern : pattern.slice(0, wildcardIdx);
      expect(prefix, `resolved prefix drifted for ${r.id}`).toBe(derived);
    }
  });

  it('every cacheable resource has a DISTINCT pathPrefix (so prefix-matching CDNs can enforce per-resource scope)', () => {
    // The whole point of paths v2: each cacheable resource lives at
    // its own prefix. Two resources sharing a prefix would mean a
    // prefix-matching CDN (Bunny / Cloud CDN / Azure FD) couldn't
    // tell them apart at the edge.
    const cacheablePrefixes = Object.values(DOC_RESOURCES)
      .filter((r) => r.cdnCacheable)
      .map((r) => r.resolvePathPrefix('doc_X', 'myLayer'));
    const unique = new Set(cacheablePrefixes);
    expect(unique.size).toBe(cacheablePrefixes.length);
  });
});
