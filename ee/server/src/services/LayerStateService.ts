import type {
  AnnotationMutationKind,
  CacheDelta,
  DocumentManifest,
  ManifestPage,
  PageState,
} from '@embedpdf/engine-core/runtime';
import {
  changesAnnotationList,
  invalidatesWeakIndexRefs,
  knownWeakAnnotationState,
} from '@embedpdf/engine-core/runtime';
import type {
  DocumentPagesRepo,
  DurablePageRow,
  LayerRow,
  LayerPagesRepo,
  LayersRepo,
} from '../db/repos/page_state.repo';
import type { DocumentHead } from './DocumentService';

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
    layer: Pick<LayerRow, 'docVersion' | 'layoutVersion' | 'metadataVersion' | 'lastAuditId'>,
    pages: DurablePageRow[],
  ): DocumentManifest {
    return {
      docVersion: layer.docVersion,
      layoutVersion: layer.layoutVersion,
      metadataVersion: layer.metadataVersion,
      actionsVersion: 1,
      // Written in the same transaction as the audit append, so a client
      // subscribing from this manifest can never miss a row (gapless cursor).
      auditHead: layer.lastAuditId,
      baseSha,
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
