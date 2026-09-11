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
import type { Transaction } from 'kysely';

import type { DocumentHead } from './DocumentService';
import {
  INITIAL_BASE_POINTERS,
  type BasePlanePointers,
  type BaseVersionsRepo,
} from '../db/repos/base_versions.repo';
import type { DocumentsRepo } from '../db/repos/documents.repo';
import type {
  DocumentPagesRepo,
  DurablePageRow,
  LayerRow,
  LayerPagesRepo,
  LayersRepo,
} from '../db/repos/page_state.repo';
import type { Database as Schema } from '../db/schema';

export interface LayerStateServiceOptions {
  documentPages: DocumentPagesRepo;
  layers: LayersRepo;
  layerPages: LayerPagesRepo;
  documents: DocumentsRepo;
  baseVersions: BaseVersionsRepo;
}

/**
 * What a manifest says about the base version it is over: the sha, the
 * byte length (with the sha, the `BaseVersionInfo` a client signs) and the
 * plane pointers that version publishes (law 9c: comparisons and seeds
 * use these, never the initial-epoch constants).
 */
export interface BaseVersionFacts extends BasePlanePointers {
  sha256: string;
  byteLength: number;
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
  private readonly documents: DocumentsRepo;
  private readonly baseVersions: BaseVersionsRepo;

  constructor(opts: LayerStateServiceOptions) {
    this.documentPages = opts.documentPages;
    this.layers = opts.layers;
    this.layerPages = opts.layerPages;
    this.documents = opts.documents;
    this.baseVersions = opts.baseVersions;
  }

  /**
   * The facts of one base version. A document whose catalog row is
   * missing (committed before migration 030 ran on this replica, or the
   * row insert after commit failed) reads as version 1 at the initial
   * epochs — exactly what the catalog would have recorded for it.
   */
  async baseVersionFacts(
    docId: string,
    sha256: string,
    fallbackByteLength: number | null,
  ): Promise<BaseVersionFacts> {
    const row = await this.baseVersions.find(docId, sha256);
    if (row) {
      return {
        sha256: row.sha256,
        byteLength: row.byteLength,
        layoutVersion: row.layoutVersion,
        metadataVersion: row.metadataVersion,
        attachmentsVersion: row.attachmentsVersion,
        annotationsVersion: row.annotationsVersion,
      };
    }
    return { sha256, byteLength: fallbackByteLength ?? 0, ...INITIAL_BASE_POINTERS };
  }

  /** The head's facts: `documents.base_sha` and its catalog row. */
  async headBaseFacts(docId: string): Promise<BaseVersionFacts | null> {
    const doc = await this.documents.findById(docId);
    if (!doc?.baseSha) return null;
    return this.baseVersionFacts(docId, doc.baseSha, doc.storageSizeBytes);
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
   * Plane scopes, the PURE half. A layer is a set of per-plane DELTAS
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
    layer: Pick<
      LayerRow,
      'layoutVersion' | 'metadataVersion' | 'attachmentsVersion' | 'baseSha'
    > | null,
    layerPages: DurablePageRow[],
    basePages: DurablePageRow[],
    /** The HEAD version's facts; a never-published document is at the initial epochs. */
    head: Pick<
      BaseVersionFacts,
      'sha256' | 'layoutVersion' | 'metadataVersion' | 'attachmentsVersion'
    > | null = null,
  ): LayerScopes {
    if (!layer) return { ...ALL_BASE_SCOPES };
    // Law 9: a layer whose base is not the head (a sibling published a
    // version since) is diverged for EVERY plane — the head's layout,
    // metadata and attachments are another version's. Its reads resolve
    // at layer URLs over its own base until it is rebased.
    if (head && layer.baseSha !== null && layer.baseSha !== head.sha256) {
      return {
        content: 'layer',
        annotations: 'layer',
        layout: 'layer',
        attachments: 'layer',
        metadata: 'layer',
        actions: 'base',
      };
    }
    const base = head ?? { ...INITIAL_BASE_POINTERS, sha256: layer.baseSha ?? '' };
    // A layer row without page rows means no page-level write ever
    // committed — content and annotations are trivially inherited.
    const pagesKnown = layerPages.length > 0;
    return {
      content: pagesKnown ? pagePlaneScope(layerPages, basePages, 'contentVersion') : 'base',
      annotations: pagesKnown ? pagePlaneScope(layerPages, basePages, 'annotationVersion') : 'base',
      // Doc-level planes compare against the BASE VERSION's pointers (law
      // 9c): a layer seeded over a published version whose metadata sits
      // at epoch 2 is inherited at 2, not owned because 2 ≠ 1.
      layout: layer.layoutVersion === base.layoutVersion ? 'base' : 'layer',
      attachments: layer.attachmentsVersion === base.attachmentsVersion ? 'base' : 'layer',
      metadata: layer.metadataVersion === base.metadataVersion ? 'base' : 'layer',
      actions: 'base',
    };
  }

  /**
   * Plane scopes, the DURABLE half — the ONE condition behind the
   * manifest `scopes` block, the `/v1/access` edge grant, and every origin
   * guard on the doc-level shared routes (the guard is the truth; the grant
   * is the TTL-bounded optimization). A layer with no row has never been
   * written: trivially all-inherited.
   */
  async computeLayerScopesFromDb(docId: string, layerName: string): Promise<LayerScopes> {
    const layer = await this.layers.findByDocAndName(docId, layerName);
    if (!layer) return { ...ALL_BASE_SCOPES };
    const [layerPages, basePages, head] = await Promise.all([
      this.layerPages.findByLayer(layer.id),
      this.documentPages.findByDocument(docId),
      this.headBaseFacts(docId),
    ]);
    return this.computeLayerScopes(layer, layerPages, basePages, head);
  }

  buildBaseManifest(
    head: DocumentHead,
    pages: DurablePageRow[],
    /** The head version's facts: its plane pointers are what the base view publishes (law 9). */
    version: BaseVersionFacts,
  ): DocumentManifest {
    return {
      docVersion: head.docVersion,
      // The base view's pointers are its VERSION's: the initial epochs for
      // an upload, the signing layer's pointers for a published version.
      layoutVersion: version.layoutVersion,
      metadataVersion: version.metadataVersion,
      actionsVersion: 1,
      attachmentsVersion: version.attachmentsVersion,
      annotationsVersion: version.annotationsVersion,
      // No layer writes have happened on the base view; a fresh subscriber's
      // gapless cursor starts at 0 ("everything in the log is new to me").
      auditHead: 0,
      baseSha: head.baseSha,
      layerVersion: 0,
      working: false,
      baseByteLength: version.byteLength,
      pages: pages.map((page) => this.toManifestPage(`cloud:base:${head.id}`, page)),
    };
  }

  buildLayerManifest(
    docId: string,
    /** The LAYER's base version (behind the head after a sibling published). */
    base: Pick<BaseVersionFacts, 'sha256' | 'byteLength'>,
    layerName: string,
    layer: Pick<
      LayerRow,
      | 'docVersion'
      | 'layoutVersion'
      | 'metadataVersion'
      | 'attachmentsVersion'
      | 'annotationsVersion'
      | 'lastAuditId'
      | 'currentVersion'
      | 'currentArtifactKey'
    >,
    pages: DurablePageRow[],
    /**
     * Plane scopes for this layer (see {@link computeLayerScopes}) —
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
      annotationsVersion: layer.annotationsVersion,
      // Written in the same transaction as the audit append, so a client
      // subscribing from this manifest can never miss a row (gapless cursor).
      auditHead: layer.lastAuditId,
      baseSha: base.sha256,
      // The signing fences a client pins: the layer's write serial, and
      // whether an artifact (edits not yet sealed into a version) exists —
      // `currentVersion > 0` alone no longer says so after a publish.
      layerVersion: layer.currentVersion,
      working: layer.currentArtifactKey !== null,
      baseByteLength: base.byteLength,
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
    /**
     * The new bulk-annotations pin when this mutation bumped it. Stamped
     * by the annotation CRUD, flatten, and redaction paths; the form and
     * page-structure paths bump the COLUMN but omit it here — their
     * clients recover through the 404-refresh rail, which is correct,
     * just one round trip slower.
     */
    annotationsVersion?: number;
    pages: DurablePageRow[];
  }): CacheDelta {
    return {
      previousDocVersion: input.previousDocVersion,
      docVersion: input.docVersion,
      ...(input.annotationsVersion !== undefined
        ? { annotationsVersion: input.annotationsVersion }
        : {}),
      // Every ordinary commit writes an artifact: the layer holds edits not
      // yet sealed into a version (a signature's publish clears it again,
      // and refreshes the manifest instead of sending a delta).
      working: true,
      pages: input.pages.map((page) => ({
        pageObjectNumber: page.pageObjectNumber,
        cache: this.toCachePins(page),
      })),
    };
  }

  /**
   * Law 9: a published version contains everything the signing layer's
   * artifact carried — every page it touched, its page order, metadata,
   * attachments, annotations — so the head's catalog becomes the layer's
   * COMPLETE surviving page set: rows the layer has replace the base's,
   * pages it inserted are added, pages it deleted (seeded on first write,
   * removed by pages.delete) disappear; the signed page gets one more
   * annotation bump for the signature widget. The layer's rows are then
   * the base's again (it inherits every plane over the new version). A
   * layer with no page rows was never page-written: the base's rows carry
   * over unchanged but for the signed page.
   */
  async promoteLayerToBase(
    trx: Transaction<Schema>,
    input: { docId: string; layerId: string; signedPage: number | null; now: number },
  ): Promise<DurablePageRow[]> {
    const layerRows = await trx
      .selectFrom('layer_pages')
      .selectAll()
      .where('layer_id', '=', input.layerId)
      .orderBy('page_object_number', 'asc')
      .execute();
    const baseRows = await trx
      .selectFrom('document_pages')
      .selectAll()
      .where('doc_id', '=', input.docId)
      .orderBy('page_object_number', 'asc')
      .execute();
    const source = layerRows.length > 0 ? layerRows : baseRows;
    const promoted = source.map((row) => {
      const signed =
        input.signedPage !== null && Number(row.page_object_number) === input.signedPage;
      return {
        pageObjectNumber: Number(row.page_object_number),
        contentVersion: Number(row.content_version),
        annotationVersion: Number(row.annotation_version) + (signed ? 1 : 0),
        annotationGeneration: Number(row.annotation_generation),
        hasWeakAnnotations: Boolean(row.has_weak_annotations),
        updatedAt: signed ? input.now : Number(row.updated_at),
      };
    });
    await trx.deleteFrom('document_pages').where('doc_id', '=', input.docId).execute();
    if (promoted.length > 0) {
      await trx
        .insertInto('document_pages')
        .values(
          promoted.map((page) => ({
            doc_id: input.docId,
            page_object_number: page.pageObjectNumber,
            content_version: page.contentVersion,
            annotation_version: page.annotationVersion,
            annotation_generation: page.annotationGeneration,
            has_weak_annotations: page.hasWeakAnnotations ? 1 : 0,
            updated_at: page.updatedAt,
          })),
        )
        .execute();
    }
    if (layerRows.length > 0) {
      await trx.deleteFrom('layer_pages').where('layer_id', '=', input.layerId).execute();
      await trx
        .insertInto('layer_pages')
        .values(
          promoted.map((page) => ({
            layer_id: input.layerId,
            page_object_number: page.pageObjectNumber,
            content_version: page.contentVersion,
            annotation_version: page.annotationVersion,
            annotation_generation: page.annotationGeneration,
            has_weak_annotations: page.hasWeakAnnotations ? 1 : 0,
            updated_at: page.updatedAt,
          })),
        )
        .execute();
    }
    return promoted;
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
   *  (doc-level) annotation read stamps on its tokens. */
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
    documents: DocumentsRepo;
    baseVersions: BaseVersionsRepo;
  } {
    return {
      documentPages: this.documentPages,
      layers: this.layers,
      layerPages: this.layerPages,
      documents: this.documents,
      baseVersions: this.baseVersions,
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
