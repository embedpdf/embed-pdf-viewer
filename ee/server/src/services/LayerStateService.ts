import type {
  AnnotationMutationKind,
  CacheDelta,
  DocumentManifest,
  LayerScopes,
  ManifestPage,
  PageState,
} from '@embedpdf/engine-core/runtime';
import {
  changesAnnotationList,
  invalidatesWeakIndexRefs,
  knownWeakAnnotationState,
} from '@embedpdf/engine-core/runtime';

import type { DocumentHead } from './DocumentService';
import type {
  DocumentPagesRepo,
  DurablePageRow,
  LayerRow,
  LayerPagesRepo,
  LayersRepo,
} from '../db/repos/page_state.repo';

export interface LayerStateServiceOptions {
  documentPages: DocumentPagesRepo;
  layers: LayersRepo;
  layerPages: LayerPagesRepo;
}

export type MutationImpactKind = AnnotationMutationKind;

/**
 * Geometry-pointer epoch for the immutable base view. The base topology is
 * never reordered (structural ops always target a layer), so it stays at 1.
 */
const BASE_LAYOUT_VERSION = 1;

/**
 * Metadata-pointer epoch for the immutable base view. The base Info dict is
 * never edited (metadata writes always target a layer), so it stays at 1.
 */
const BASE_METADATA_VERSION = 1;

/** The immutable base /EmbeddedFiles tree's epoch — a layer whose
 *  `attachmentsVersion` still sits here has never written an attachment. */
const BASE_ATTACHMENTS_VERSION = 1;

/** Every plane inherited — the scopes of a never-written layer. */
const ALL_BASE_SCOPES: LayerScopes = {
  content: 'base',
  annotations: 'base',
  layout: 'base',
  attachments: 'base',
  metadata: 'base',
  actions: 'base',
};

/**
 * Per-page plane comparison: inherited iff the page SET matches the base
 * exactly AND every page's pin equals its base counterpart's. Set inequality
 * (insert/delete) reads as owned for BOTH per-page planes at the call sites.
 */
function pagePlaneScope(
  layerPages: DurablePageRow[],
  basePages: DurablePageRow[],
  pin: 'contentVersion' | 'annotationVersion',
): 'base' | 'layer' {
  if (layerPages.length !== basePages.length) return 'layer';
  const baseByPon = new Map(basePages.map((p) => [p.pageObjectNumber, p[pin]]));
  for (const page of layerPages) {
    if (baseByPon.get(page.pageObjectNumber) !== page[pin]) return 'layer';
  }
  return 'base';
}

/**
 * Durable authority for cloud/CDN page state.
 *
 * Worker sessions are still responsible for PDF parsing/mutation. This
 * service owns the durable DB-backed page state used by manifests and CDN
 * version checks; `CloudRevisionBridge` owns worker/cloud token translation.
 */
export class LayerStateService {
  private readonly documentPages: DocumentPagesRepo;
  private readonly layers: LayersRepo;
  private readonly layerPages: LayerPagesRepo;

  constructor(opts: LayerStateServiceOptions) {
    this.documentPages = opts.documentPages;
    this.layers = opts.layers;
    this.layerPages = opts.layerPages;
  }

  async ensureBasePages(
    docId: string,
    loadPages: () => Promise<PageState[]>,
  ): Promise<DurablePageRow[]> {
    const existing = await this.documentPages.findByDocument(docId);
    if (existing.length > 0) return existing;

    const observed = await loadPages();
    await this.documentPages.upsertForDocument(
      docId,
      observed.map((page) => ({
        pageObjectNumber: page.pageObjectNumber,
        hasWeakAnnotations: requireKnownWeakAnnotationBoolean(page),
      })),
    );
    return this.documentPages.findByDocument(docId);
  }

  async ensureLayerPagesFromBase(input: {
    layerId: string;
    docId: string;
  }): Promise<DurablePageRow[]> {
    const existing = await this.layerPages.findByLayer(input.layerId);
    if (existing.length > 0) return existing;
    const basePages = await this.documentPages.findByDocument(input.docId);
    await this.layerPages.snapshotImmutableBaseForLayer(input.layerId, basePages);
    return this.layerPages.findByLayer(input.layerId);
  }

  /**
   * WS2b plane scopes, the PURE half. A layer is a set of per-plane DELTAS
   * over the immutable base; each plane is `'base'` (inherited — no delta,
   * the layer's view of that plane IS the base's view) or `'layer'` (owned —
   * the first write to that plane transferred ownership).
   *
   * Per-page planes (content, annotations) compare against the base
   * counterpart AND require page-SET equality: insert/delete own both — a
   * view that removed content must never resolve base artifacts. Structural
   * ops that PRESERVE the set (move, rotate) own only `layout`:
   * render/text/geometry artifacts are normalized (rotation is presentation
   * metadata applied client-side — see `PageRotateResult`), so content and
   * annotation sharing survive them. Doc-level planes compare their pin
   * against the base epoch. `actions` is constant `'base'` until action
   * writing exists (`actionsVersion` is frozen at 1 — no op can change
   * catalog actions).
   *
   * Conservative by design: an unmatched page reads as owned.
   */
  computeLayerScopes(
    layer: Pick<LayerRow, 'layoutVersion' | 'metadataVersion' | 'attachmentsVersion'> | null,
    layerPages: DurablePageRow[],
    basePages: DurablePageRow[],
  ): LayerScopes {
    if (!layer) return { ...ALL_BASE_SCOPES };
    // A layer row without page rows means no page-level write ever
    // committed — content and annotations are trivially inherited.
    const pagesKnown = layerPages.length > 0;
    return {
      content: pagesKnown ? pagePlaneScope(layerPages, basePages, 'contentVersion') : 'base',
      annotations: pagesKnown ? pagePlaneScope(layerPages, basePages, 'annotationVersion') : 'base',
      layout: layer.layoutVersion === BASE_LAYOUT_VERSION ? 'base' : 'layer',
      attachments: layer.attachmentsVersion === BASE_ATTACHMENTS_VERSION ? 'base' : 'layer',
      metadata: layer.metadataVersion === BASE_METADATA_VERSION ? 'base' : 'layer',
      actions: 'base',
    };
  }

  /**
   * WS2b plane scopes, the DURABLE half — the ONE condition behind the
   * manifest `scopes` block, the `/v1/access` edge grant, and every origin
   * guard on the doc-level shared routes (the guard is the truth; the grant
   * is the TTL-bounded optimization). A layer with no row has never been
   * written: trivially all-inherited.
   */
  async computeLayerScopesFromDb(docId: string, layerName: string): Promise<LayerScopes> {
    const layer = await this.layers.findByDocAndName(docId, layerName);
    if (!layer) return { ...ALL_BASE_SCOPES };
    const [layerPages, basePages] = await Promise.all([
      this.layerPages.findByLayer(layer.id),
      this.documentPages.findByDocument(docId),
    ]);
    return this.computeLayerScopes(layer, layerPages, basePages);
  }

  buildBaseManifest(head: DocumentHead, pages: DurablePageRow[]): DocumentManifest {
    return {
      docVersion: head.docVersion,
      // The base view is never reordered (structural ops always target a
      // layer), so its geometry pointer is the initial epoch.
      layoutVersion: BASE_LAYOUT_VERSION,
      // Likewise the base Info dict is never edited (metadata writes always
      // target a layer), so its metadata pointer is the initial epoch.
      metadataVersion: BASE_METADATA_VERSION,
      actionsVersion: 1,
      // The base view's EmbeddedFiles tree is immutable (attachment writes
      // always target a layer), so its pointer is the initial epoch.
      attachmentsVersion: 1,
      // No layer writes have happened on the base view; a fresh subscriber's
      // gapless cursor starts at 0 ("everything in the log is new to me").
      auditHead: 0,
      baseSha: head.baseSha,
      pages: pages.map((page) => this.toManifestPage(`cloud:base:${head.id}`, page)),
    };
  }

  buildLayerManifest(
    docId: string,
    baseSha: string,
    layerName: string,
    layer: Pick<
      LayerRow,
      'docVersion' | 'layoutVersion' | 'metadataVersion' | 'attachmentsVersion' | 'lastAuditId'
    >,
    pages: DurablePageRow[],
    /**
     * WS2b plane scopes for this layer (see {@link computeLayerScopes}) —
     * whole-layer by design (edge grants are prefix-level): one owned page
     * flips the whole plane.
     */
    scopes: LayerScopes,
  ): DocumentManifest {
    return {
      docVersion: layer.docVersion,
      layoutVersion: layer.layoutVersion,
      metadataVersion: layer.metadataVersion,
      actionsVersion: 1,
      attachmentsVersion: layer.attachmentsVersion,
      // Written in the same transaction as the audit append, so a client
      // subscribing from this manifest can never miss a row (gapless cursor).
      auditHead: layer.lastAuditId,
      baseSha,
      scopes,
      pages: pages.map((page) =>
        this.toManifestPage(this.layerRevisionScopeId(docId, layerName), page),
      ),
    };
  }

  buildCacheDelta(input: {
    docId: string;
    layerName: string;
    previousDocVersion: number;
    docVersion: number;
    pages: DurablePageRow[];
  }): CacheDelta {
    return {
      previousDocVersion: input.previousDocVersion,
      docVersion: input.docVersion,
      pages: input.pages.map((page) => ({
        pageObjectNumber: page.pageObjectNumber,
        cache: this.toCachePins(page),
      })),
    };
  }

  decorateBasePageState(docId: string, page: DurablePageRow): PageState {
    return this.toPageState(`cloud:base:${docId}`, page);
  }

  decorateLayerPageState(docId: string, layerName: string, page: DurablePageRow): PageState {
    return this.toPageState(this.layerRevisionScopeId(docId, layerName), page);
  }

  toLayerManifestPage(docId: string, layerName: string, page: DurablePageRow): ManifestPage {
    return this.toManifestPage(this.layerRevisionScopeId(docId, layerName), page);
  }

  layerRevisionScopeId(docId: string, layerName: string): string {
    return `cloud:layer:${docId}:${layerName}`;
  }

  /** The BASE view's revision scope — the `docSessionId` every SHARED
   *  (doc-level) annotation read stamps on its tokens (WS2b). */
  baseRevisionScopeId(docId: string): string {
    return `cloud:base:${docId}`;
  }

  mutationBumps(
    kind: MutationImpactKind,
    pageBefore: Pick<DurablePageRow, 'hasWeakAnnotations'>,
  ): {
    bumpLayerDocVersion: boolean;
    bumpAnnotationVersion: boolean;
    bumpContentVersion: boolean;
    bumpAnnotationGeneration: boolean;
    weakRefsInvalidated: boolean;
  } {
    const weakRefsInvalidated = invalidatesWeakIndexRefs(
      kind,
      knownWeakAnnotationState(pageBefore.hasWeakAnnotations),
    );
    // `annotation_generation` is the durable epoch of the page's /Annots
    // index space, not a count of currently-weak annotations. Keep bumping
    // it for every delete/move even when `hasWeakAnnotations` is false:
    // older CDN-cached snapshots may still contain index refs minted before
    // an update strengthened those annotations with /NM or object numbers.
    // `weakRefsInvalidated` is only the client refetch hint for refs known
    // to be weak in the current page state.
    const shiftsAnnotationIndexes = kind === 'delete' || kind === 'move';
    return {
      bumpLayerDocVersion: true,
      bumpAnnotationVersion: changesAnnotationList(kind),
      bumpContentVersion: false,
      bumpAnnotationGeneration: shiftsAnnotationIndexes,
      weakRefsInvalidated,
    };
  }

  get repos(): {
    documentPages: DocumentPagesRepo;
    layers: LayersRepo;
    layerPages: LayerPagesRepo;
  } {
    return {
      documentPages: this.documentPages,
      layers: this.layers,
      layerPages: this.layerPages,
    };
  }

  private toManifestPage(scopeId: string, page: DurablePageRow): ManifestPage {
    return {
      state: this.toPageState(scopeId, page),
      cache: this.toCachePins(page),
    };
  }

  private toCachePins(page: DurablePageRow): { contentVersion: number; annotationVersion: number } {
    return {
      contentVersion: page.contentVersion,
      annotationVersion: page.annotationVersion,
    };
  }

  private toPageState(scopeId: string, page: DurablePageRow): PageState {
    return {
      pageObjectNumber: page.pageObjectNumber,
      revision: {
        docSessionId: scopeId,
        pageObjectNumber: page.pageObjectNumber,
        generation: page.annotationGeneration,
      },
      weakAnnotationState: {
        kind: 'known',
        hasAnyWeakAnnotations: page.hasWeakAnnotations,
      },
    };
  }
}

function requireKnownWeakAnnotationBoolean(page: PageState): boolean {
  if (page.weakAnnotationState.kind !== 'known') {
    throw new Error(
      `cannot initialize durable manifest state from unknown weak annotation state for page ${page.pageObjectNumber}`,
    );
  }
  return page.weakAnnotationState.hasAnyWeakAnnotations;
}
