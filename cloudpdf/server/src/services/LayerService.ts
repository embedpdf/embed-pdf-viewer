import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EngineError,
  EngineErrorCode,
  wirePack,
  type AnnotationActor,
  type AnnotationCreateResult,
  type AnnotationDeleteResult,
  type WireAnnotationDraft,
  type AnnotationMoveResult,
  type WireAnnotationPatch,
  type WireResourceMap,
  type AnnotationRef,
  type AnnotationUpdateResult,
  type FormDataFormat,
  type FormEffect,
  type FormEffectsResult,
  type FormFieldCreateResult,
  type FormFieldDeleteResult,
  type FormFieldDraft,
  type FormFieldPatch,
  type FormFieldRef,
  type FormFieldUpdateResult,
  type FormFieldValue,
  type FormImportResult,
  type FormRepairResult,
  type FormSetValueResult,
  type FormSnapshot,
  type FormWidgetLinkResult,
  type FormWidgetRef,
  type IdentityClaims,
  type MetadataPatch,
  type MetadataUpdateResult,
  type MutationMeta,
  type PageDeleteResult,
  type PageFlattenResult,
  type PageFlattenUsage,
  type RedactionApplyResult,
  type RedactionApplyScope,
  type PageListSnapshot,
  type PageMoveResult,
  type PageObjectNumber,
  type PageRotateResult,
  type PageRotation,
  type PageState,
  type PageStructureCache,
  type WirePack,
  type WorkerJobId,
  type WorkerRequest,
  type WireAttachmentFile,
  type EmbeddedFileRef,
  type AttachmentCreateResult,
  type AttachmentDeleteResult,
} from '@embedpdf/engine-core/runtime';
import type { Kysely, Transaction } from 'kysely';

import type { CloudRevisionBridge } from './CloudRevisionBridge';
import type { DocumentService, OpenContext } from './DocumentService';
import type { AuditEvent, EventLogService } from './EventLogService';
import type { LayerStateService } from './LayerStateService';
import type { MutationImpactKind } from './LayerStateService';
import type { WeakAnnotationSessionService } from './WeakAnnotationSessionService';
import type { EngineCounters } from '../app/engine-counters';
import type { AuditMutationKind } from '../db/repos/audit_log.repo';
import type { DocumentsRepo } from '../db/repos/documents.repo';
import type { DurablePageRow, LayerRow } from '../db/repos/page_state.repo';
import type { Database as Schema } from '../db/schema';
import type { RealtimeBus } from '../realtime/RealtimeBus';
import type { EnginePool } from '../runtime/EnginePool';
import { StorageKeys } from '../storage/keys';
import type { ObjectStore } from '../storage/ObjectStore';

type LayerArtifactInput = { bytes: ArrayBuffer; size: number } | { path: string };

/**
 * The commit-time version CAS lost: `layers.current_version` moved between
 * this op's prepare (which aligned the worker session to the row it read)
 * and its commit transaction. Under the per-process write queue that can
 * only mean a REMOTE replica committed in the window — the signal for
 * {@link LayerService.runWithRebase} to reload the session from the new
 * durable head and re-apply. A distinct class and a distinct code — never
 * a bare `Aborted` — so neither the rebase path nor a client SDK can
 * confuse a fence loss with a caller-initiated cancellation: it surfaces
 * as HTTP 409 (retryable), not 499.
 */
export class LayerFenceConflict extends EngineError {
  constructor(message: string) {
    super(EngineErrorCode.LayerVersionConflict, message);
  }
}

/** The durable state an annotation commit produced inside its transaction —
 *  the input `finalizePayload` turns into the wire result. */
interface CommittedAnnotationMutation {
  page: DurablePageRow;
  weakRefsInvalidated: boolean;
  previousLayerDocVersion: number;
  layerDocVersion: number;
}

/**
 * Per-page impact of a form mutation, in the annotation-plane vocabulary
 * `mutationBumps` already understands: `create` for pages that gained
 * widget annotations, `delete` for pages that lost them (the /Annots index
 * space shifts, so the annotation generation must advance), `update` for
 * pages whose widget appearances changed in place.
 */
interface FormPageImpact {
  pageObjectNumber: number;
  kind: MutationImpactKind;
}

/** The durable state a form commit produced inside its transaction. Forms
 *  are document-scoped, so 0..N pages may have been touched. */
interface CommittedFormMutation {
  pages: DurablePageRow[];
  previousLayerDocVersion: number;
  layerDocVersion: number;
}

/** Flatten has form-like multi-page persistence, but with explicit content
 * and annotation-list bumps on every page whose native outcome may have
 * changed the document. */
interface CommittedPageFlatten {
  pages: DurablePageRow[];
  previousLayerDocVersion: number;
  layerDocVersion: number;
}

export interface LayerServiceOptions {
  db?: Kysely<Schema>;
  documents: DocumentsRepo;
  layerState: LayerStateService;
  revisionBridge?: CloudRevisionBridge;
  documentService?: DocumentService;
  eventLog?: EventLogService;
  weakAnnotationSessions?: WeakAnnotationSessionService;
  pool?: EnginePool;
  storage?: ObjectStore;
  /** Cross-replica doorbell — rung after every mutation commit. */
  realtime?: RealtimeBus;
  /** C5 flip instruments (metrics reads them via collect closures). */
  counters?: EngineCounters;
}

export type LayerWriteContext = OpenContext;

export interface MaterializedLayer {
  layer: LayerRow;
  pages: DurablePageRow[];
}

/**
 * Write-side layer coordinator.
 *
 * Read paths intentionally virtualize never-created layers from
 * `document_pages` without creating DB rows. This service is the
 * mutation-side boundary: the first real write to `(docId, layerName)`
 * materializes the layer row and initializes layer-local page state.
 */
export class LayerService {
  private readonly db?: Kysely<Schema>;
  private readonly documents: DocumentsRepo;
  private readonly layerState: LayerStateService;
  private readonly revisionBridge?: CloudRevisionBridge;
  private readonly documentService?: DocumentService;
  private readonly eventLog?: EventLogService;
  private readonly weakAnnotationSessions?: WeakAnnotationSessionService;
  private readonly pool?: EnginePool;
  private readonly storage?: ObjectStore;
  private readonly realtime?: RealtimeBus;
  private readonly layerWriteQueues = new Map<string, Promise<unknown>>();
  /**
   * Attempt artifact keys uploaded by the CURRENT write op that no commit
   * has claimed yet (layerWriteKey → keys). Registered by
   * {@link nextArtifactKey}, claimed by {@link finishLayerCommit}, and
   * whatever remains is deleted by the write wrapper's cleanup — a lost
   * CAS or a failed commit must not leak its upload into the object store
   * forever.
   */
  private readonly pendingAttemptKeys = new Map<string, Set<string>>();

  private readonly counters?: EngineCounters;

  constructor(opts: LayerServiceOptions) {
    this.db = opts.db;
    this.counters = opts.counters;
    this.documents = opts.documents;
    this.layerState = opts.layerState;
    this.revisionBridge = opts.revisionBridge;
    this.documentService = opts.documentService;
    this.eventLog = opts.eventLog;
    this.weakAnnotationSessions = opts.weakAnnotationSessions;
    this.pool = opts.pool;
    this.storage = opts.storage;
    this.realtime = opts.realtime;
  }

  /**
   * Create or fetch the physical layer for a write.
   *
   * The initialized `layer_pages` rows copy only durable base topology
   * and weak-annotation truth. The base document is immutable, so
   * copying its counters is the initial layer epoch; after this point
   * only `layer_pages` advances.
   *
   * Callers must ensure `document_pages` has already been initialized
   * from PDFium before the first write. In the cloud route this happens
   * by opening the document/manifest through `DocumentService` first.
   */
  async materializeLayerForWrite(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
  ): Promise<MaterializedLayer> {
    const doc = await this.documents.requireOwned(docId, ctx.tenantId);
    if (doc.state !== 'ready') {
      throw new EngineError(
        EngineErrorCode.DocOpenFailed,
        `cannot materialize layer for non-ready document: ${docId} (${doc.state})`,
      );
    }

    const basePages = await this.layerState.repos.documentPages.findByDocument(docId);
    if (basePages.length === 0) {
      throw new EngineError(
        EngineErrorCode.DocOpenFailed,
        `cannot materialize layer before base page state exists: ${docId}`,
      );
    }

    const layer = await this.layerState.repos.layers.createEmpty({
      id: `layer_${randomUUID()}`,
      docId,
      tenantId: ctx.tenantId,
      name: layerName,
    });
    const pages = await this.layerState.ensureLayerPagesFromBase({ layerId: layer.id, docId });
    return { layer, pages };
  }

  async createAnnotation(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      pageObjectNumber: PageObjectNumber;
      draft: WireAnnotationDraft;
      /**
       * Optional actor override. When supplied, replaces the actor
       * built from `ctx.jwt.identity`. Routes pass this so that the
       * actor construction (and any future policy on it) lives next to
       * the capability check. The service trusts what arrives here.
       */
      actor?: AnnotationActor;
      /** Binary payloads referenced by the draft (multipart `resource:{key}` parts). */
      resources?: WireResourceMap;
    },
    signal?: AbortSignal,
  ): Promise<AnnotationCreateResult> {
    const actor = input.actor ?? actorFromContext(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'annotations.create' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            pageObjectNumber: input.pageObjectNumber,
            draft: input.draft,
            ...(input.resources ? { resources: input.resources } : {}),
            artifactPath,
            ...(actor ? { actor } : {}),
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'annotations.create') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected annotations.create payload: ${payload.tag}`,
          );
        }
        return this.persistAnnotationMutation(ctx, input.docId, input.layerName, layer, 'create', {
          result: payload.result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  async updateAnnotation(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      ref: AnnotationRef;
      patch: WireAnnotationPatch;
      /** Binary payloads referenced by the patch (multipart `resource:{key}` parts). */
      resources?: WireResourceMap;
      /**
       * Optional actor override. For UPDATE this is typically built
       * from the caller's JWT identity (for /UpdatedBy) PLUS any
       * `patch.groupId` reassignment. Authorization for the groupId
       * change is the route's job (`checkSetGroup`).
       */
      actor?: AnnotationActor;
    },
    signal?: AbortSignal,
  ): Promise<AnnotationUpdateResult> {
    const actor = input.actor ?? actorFromContext(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      const ref = await this.rewriteRefForWorker(
        input.docId,
        input.layerName,
        layer,
        input.ref,
        signal,
      );
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'annotations.update' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            ref,
            patch: input.patch,
            ...(input.resources ? { resources: input.resources } : {}),
            artifactPath,
            ...(actor ? { actor } : {}),
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'annotations.update') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected annotations.update payload: ${payload.tag}`,
          );
        }
        return this.persistAnnotationMutation(ctx, input.docId, input.layerName, layer, 'update', {
          result: payload.result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  /**
   * Resolve the collab subject (userId / groupId) of the target
   * annotation a PATCH or DELETE is about to act on. Route guards
   * call this BEFORE the mutation so `requireLayerCollabAction` can
   * deny with 403 without ever issuing a write.
   *
   * V1 implementation: page-fetch + filter. Reuses the existing
   * `annotations.listFullPage` worker job (the only annotation read
   * path the worker currently exposes) and finds the row matching
   * the ref. Returns an empty `{}` if the annotation can't be
   * located — the route guard then evaluates the collab filter against
   * an unstamped target, which denies self/group filters and allows
   * `all`. If the annotation truly doesn't exist, the subsequent
   * mutator call will throw the correct `InvalidReference`.
   *
   * Tracked as a follow-up optimisation: a dedicated worker job that
   * resolves ref → /EMBD_Metadata without serialising the whole page.
   */
  async getAnnotationCollabTarget(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    pageObjectNumber: PageObjectNumber,
    ref: AnnotationRef,
    signal?: AbortSignal,
  ): Promise<{ userId?: string; groupId?: string }> {
    // The worker job below assumes the layer is already attached to the
    // pool's session for `docId`. Most read paths already do this via
    // `documentService.ensureLayerOnPool`; collab gating runs before any
    // mutation, so we have to open it ourselves.
    await this.requireDocumentService().ensureLayerOnPool(ctx, docId, layerName);

    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'annotations.listFullPage' as const,
        jobId,
        docId,
        layerName,
        pageObjectNumber,
      });
    const payload = await this.requirePool().run(docId, build, signal);
    if (payload.tag !== 'annotations.listFullPage') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected annotations.listFullPage payload while resolving collab target: ${payload.tag}`,
      );
    }
    const annotations = payload.snapshot.annotations;
    const match = annotations.find((a) => {
      // Refs match in three shapes; objectNumber and nm are durable
      // identities and the safest. Index is positional and resolved
      // after the mutator's `rewriteRefForWorker`, so we only see
      // pre-rewrite indices here — which is fine because the same
      // annotation list we're searching is what the rewriter would
      // resolve against.
      switch (ref.kind) {
        case 'objectNumber':
          return a.ref.kind === 'objectNumber' && a.ref.annotObjectNumber === ref.annotObjectNumber;
        case 'nm':
          return a.nm === ref.nm;
        case 'index':
          return a.index === ref.index;
      }
    });
    if (!match) return {};
    return {
      ...(match.userId !== undefined ? { userId: match.userId } : {}),
      ...(match.groupId !== undefined ? { groupId: match.groupId } : {}),
    };
  }

  async deleteAnnotation(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      ref: AnnotationRef;
    },
    signal?: AbortSignal,
  ): Promise<AnnotationDeleteResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      await this.assertWeakAnnotationStructuralEditAllowed(ctx, {
        docId: input.docId,
        layerName: input.layerName,
        layer,
        pageObjectNumber: input.ref.pageObjectNumber,
      });
      const ref = await this.rewriteRefForWorker(
        input.docId,
        input.layerName,
        layer,
        input.ref,
        signal,
      );
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'annotations.delete' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            ref,
            artifactPath,
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'annotations.delete') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected annotations.delete payload: ${payload.tag}`,
          );
        }
        return this.persistAnnotationMutation(ctx, input.docId, input.layerName, layer, 'delete', {
          result: payload.result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  async moveAnnotations(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      pageObjectNumber: PageObjectNumber;
      refs: AnnotationRef[];
      toIndex: number;
    },
    signal?: AbortSignal,
  ): Promise<AnnotationMoveResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      await this.assertWeakAnnotationStructuralEditAllowed(ctx, {
        docId: input.docId,
        layerName: input.layerName,
        layer,
        pageObjectNumber: input.pageObjectNumber,
      });
      const refs = await Promise.all(
        input.refs.map((ref) =>
          this.rewriteRefForWorker(input.docId, input.layerName, layer, ref, signal),
        ),
      );
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'annotations.move' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            pageObjectNumber: input.pageObjectNumber,
            refs,
            toIndex: input.toIndex,
            artifactPath,
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'annotations.move') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected annotations.move payload: ${payload.tag}`,
          );
        }
        return this.persistAnnotationMutation(ctx, input.docId, input.layerName, layer, 'move', {
          result: payload.result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  async movePages(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      pageObjectNumbers: PageObjectNumber[];
      destIndex: number;
    },
    signal?: AbortSignal,
  ): Promise<PageMoveResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'pages.move' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            pageObjectNumbers: input.pageObjectNumbers,
            destIndex: input.destIndex,
            artifactPath,
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'pages.move') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected pages.move payload: ${payload.tag}`,
          );
        }
        return this.persistPageMove(ctx, input.docId, input.layerName, layer, {
          result: payload.result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  async rotatePages(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      pageObjectNumbers: PageObjectNumber[];
      rotation: PageRotation;
    },
    signal?: AbortSignal,
  ): Promise<PageRotateResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      // No weak-session guard: rotation is presentation metadata — it never
      // touches a page's /Annots array, so no in-flight weak edit can break.
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'pages.rotate' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            pageObjectNumbers: input.pageObjectNumbers,
            rotation: input.rotation,
            artifactPath,
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'pages.rotate') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected pages.rotate payload: ${payload.tag}`,
          );
        }
        return this.persistPageRotate(ctx, input.docId, input.layerName, layer, {
          result: payload.result,
          affectedPages: input.pageObjectNumbers,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  async deletePages(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      pageObjectNumbers: PageObjectNumber[];
    },
    signal?: AbortSignal,
  ): Promise<PageDeleteResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      // Destroying a page someone is mid-edit on is the collaboration
      // conflict the weak-session model exists for: for every target page
      // with weak annotations the caller must be the sole active editor.
      for (const pageObjectNumber of input.pageObjectNumbers) {
        await this.assertWeakAnnotationStructuralEditAllowed(ctx, {
          docId: input.docId,
          layerName: input.layerName,
          layer,
          pageObjectNumber,
        });
      }
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'pages.delete' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            pageObjectNumbers: input.pageObjectNumbers,
            artifactPath,
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'pages.delete') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected pages.delete payload: ${payload.tag}`,
          );
        }
        return this.persistPageDelete(ctx, input.docId, input.layerName, layer, {
          result: payload.result,
          deletedPages: input.pageObjectNumbers,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  async flattenPages(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      pageObjectNumbers: PageObjectNumber[];
      usage: PageFlattenUsage;
    },
    signal?: AbortSignal,
  ): Promise<PageFlattenResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      // Eligible annotations are removed from /Annots. Protect weak index
      // editors before the worker can shift any target page's index space.
      for (const pageObjectNumber of input.pageObjectNumbers) {
        await this.assertWeakAnnotationStructuralEditAllowed(ctx, {
          docId: input.docId,
          layerName: input.layerName,
          layer,
          pageObjectNumber,
        });
      }
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.requirePool().run(
          input.docId,
          (jobId) =>
            wirePack({
              kind: 'pages.flatten' as const,
              jobId,
              docId: input.docId,
              layerName: input.layerName,
              pageObjectNumbers: input.pageObjectNumbers,
              usage: input.usage,
              artifactPath,
            }),
          signal,
        );
        if (payload.tag !== 'pages.flatten') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected pages.flatten payload: ${payload.tag}`,
          );
        }
        if (payload.result.meta === null) return payload.result;
        return this.persistPageFlatten(ctx, input.docId, input.layerName, layer, {
          result: payload.result as PageFlattenResult & { meta: MutationMeta },
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  async applyRedactions(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      scope: RedactionApplyScope;
    },
    signal?: AbortSignal,
  ): Promise<RedactionApplyResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      // Apply removes annotations from /Annots. Protect weak index editors
      // before the worker can shift any target page's index space — the same
      // guard flatten takes, over every page the scope can touch.
      const targetPages =
        input.scope.kind === 'pages'
          ? input.scope.pageObjectNumbers
          : [...new Set(input.scope.refs.map((ref) => ref.pageObjectNumber))];
      for (const pageObjectNumber of targetPages) {
        await this.assertWeakAnnotationStructuralEditAllowed(ctx, {
          docId: input.docId,
          layerName: input.layerName,
          layer,
          pageObjectNumber,
        });
      }
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.requirePool().run(
          input.docId,
          (jobId) =>
            wirePack({
              kind: 'redaction.apply' as const,
              jobId,
              docId: input.docId,
              layerName: input.layerName,
              scope: input.scope,
              artifactPath,
            }),
          signal,
        );
        if (payload.tag !== 'redaction.apply') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected redaction.apply payload: ${payload.tag}`,
          );
        }
        if (payload.result.meta === null) return payload.result;
        return this.persistRedactionApply(ctx, input.docId, input.layerName, layer, {
          result: payload.result as RedactionApplyResult & { meta: MutationMeta },
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  async updateMetadata(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      patch: MetadataPatch;
    },
    signal?: AbortSignal,
  ): Promise<MetadataUpdateResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'metadata.update' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            patch: input.patch,
            artifactPath,
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'metadata.update') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected metadata.update payload: ${payload.tag}`,
          );
        }
        return this.persistMetadataUpdate(ctx, input.docId, input.layerName, layer, {
          result: payload.result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  // ── Attachments ──────────────────────────────────────────────────────
  //
  // Document-scoped like metadata: the /EmbeddedFiles name tree lives on
  // the catalog, so mutations touch no page rows — they advance the layer
  // doc version plus the dedicated `attachments_version` pin that keys
  // the immutable /attachments@… and /attachment-files/…@… leaves.
  // Identity is the name-tree KEY (unique by construction) — no weak
  // refs, no revision bookkeeping.

  /** Create a document-level embedded file (multipart mutation envelope). */
  async createAttachment(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      file: WireAttachmentFile;
      resources: WireResourceMap;
    },
    signal?: AbortSignal,
  ): Promise<AttachmentCreateResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'attachments.create' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            file: input.file,
            resources: input.resources,
            artifactPath,
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'attachments.create') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected attachments.create payload: ${payload.tag}`,
          );
        }
        return this.persistAttachmentMutation(ctx, input.docId, input.layerName, layer, {
          kind: 'attachment.create',
          result: payload.result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  /** Delete a document-level embedded file by name-tree key. */
  async deleteAttachment(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      ref: EmbeddedFileRef;
    },
    signal?: AbortSignal,
  ): Promise<AttachmentDeleteResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'attachments.delete' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            ref: input.ref,
            artifactPath,
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'attachments.delete') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected attachments.delete payload: ${payload.tag}`,
          );
        }
        return this.persistAttachmentMutation(ctx, input.docId, input.layerName, layer, {
          kind: 'attachment.delete',
          result: payload.result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  // ── Forms ────────────────────────────────────────────────────────────
  //
  // Forms are document-scoped: one AcroForm per layer document, mutations
  // keyed by field ref rather than page. The worker returns results whose
  // `meta` is EMPTY (the session has no durable page state); the commit
  // here is what turns per-widget change reports into real per-page
  // version bumps, using the same `mutationBumps` vocabulary as the
  // annotation plane — a widget appearance change invalidates the same
  // caches an annotation update does.

  /** Read: the reconciled form snapshot from the layer's current state. */
  async getFormSnapshot(
    ctx: OpenContext,
    input: { docId: string; layerName: string },
    signal?: AbortSignal,
  ): Promise<FormSnapshot> {
    const documentService = this.requireDocumentService();
    await documentService.getLayerManifest(ctx, input.docId, input.layerName);
    await documentService.ensureLayerOnPool(ctx, input.docId, input.layerName);
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'forms.list' as const,
        jobId,
        docId: input.docId,
        layerName: input.layerName,
      });
    const payload = await this.requirePool().run(input.docId, build, signal);
    if (payload.tag !== 'forms.list') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected forms.list payload: ${payload.tag}`,
      );
    }
    return payload.snapshot;
  }

  /** Read: serialized FDF/XFDF of the reconciled form state. */
  async exportFormData(
    ctx: OpenContext,
    input: { docId: string; layerName: string; format: FormDataFormat },
    signal?: AbortSignal,
  ): Promise<{ format: FormDataFormat; bytes: ArrayBuffer }> {
    const documentService = this.requireDocumentService();
    await documentService.getLayerManifest(ctx, input.docId, input.layerName);
    await documentService.ensureLayerOnPool(ctx, input.docId, input.layerName);
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'forms.export' as const,
        jobId,
        docId: input.docId,
        layerName: input.layerName,
        format: input.format,
      });
    const payload = await this.requirePool().run(input.docId, build, signal);
    if (payload.tag !== 'forms.export') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected forms.export payload: ${payload.tag}`,
      );
    }
    return { format: payload.format, bytes: payload.bytes };
  }

  async setFormValue(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; ref: FormFieldRef; value: FormFieldValue },
    signal?: AbortSignal,
  ): Promise<FormSetValueResult> {
    return this.runFormMutation(
      ctx,
      {
        docId: input.docId,
        layerName: input.layerName,
        tag: 'forms.setValue',
        auditKind: 'form.setValue',
        build: (jobId, artifactPath) =>
          wirePack({
            kind: 'forms.setValue' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            ref: input.ref,
            value: input.value,
            artifactPath,
          }),
        impacts: (result: FormSetValueResult) => widgetImpacts(result.changedWidgets, 'update'),
      },
      signal,
    );
  }

  async resetFormField(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; ref: FormFieldRef },
    signal?: AbortSignal,
  ): Promise<FormSetValueResult> {
    return this.runFormMutation(
      ctx,
      {
        docId: input.docId,
        layerName: input.layerName,
        tag: 'forms.reset',
        auditKind: 'form.reset',
        build: (jobId, artifactPath) =>
          wirePack({
            kind: 'forms.reset' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            ref: input.ref,
            artifactPath,
          }),
        impacts: (result: FormSetValueResult) => widgetImpacts(result.changedWidgets, 'update'),
      },
      signal,
    );
  }

  async applyFormEffects(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; effects: FormEffect[] },
    signal?: AbortSignal,
  ): Promise<FormEffectsResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const materialized = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      const { layer } = materialized;
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.requirePool().run(
          input.docId,
          (jobId) =>
            wirePack({
              kind: 'forms.applyEffects' as const,
              jobId,
              docId: input.docId,
              layerName: input.layerName,
              effects: input.effects,
              artifactPath,
            }),
          signal,
        );
        if (payload.tag !== 'forms.applyEffects') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected forms.applyEffects payload: ${payload.tag}`,
          );
        }
        const result = payload.result;
        if (result.meta === null) return result;

        const impacts = widgetImpacts(result.changedWidgets, 'update');
        const failed = result.results.filter((entry) => entry.status === 'failed');
        for (const entry of failed) {
          impacts.push(
            ...widgetImpacts(
              entry.fields.flatMap((field) => field.widgets),
              'update',
            ),
          );
        }
        // A failed native call is outcome-indeterminate. If its field could
        // not be re-read, invalidate every page rather than under-reporting
        // a possibly changed widget appearance.
        const conservativeImpacts = failed.some((entry) => entry.fields.length === 0)
          ? allPageImpacts(materialized)
          : impacts;

        return this.persistFormMutation(ctx, input.docId, input.layerName, layer, {
          auditKind: 'form.applyEffects',
          impacts: conservativeImpacts,
          result: result as FormEffectsResult & { meta: MutationMeta },
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  async importFormData(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; data: ArrayBuffer; format?: FormDataFormat },
    signal?: AbortSignal,
  ): Promise<FormImportResult> {
    return this.runFormMutation(
      ctx,
      {
        docId: input.docId,
        layerName: input.layerName,
        tag: 'forms.import',
        auditKind: 'form.import',
        build: (jobId, artifactPath) =>
          wirePack(
            {
              kind: 'forms.import' as const,
              jobId,
              docId: input.docId,
              layerName: input.layerName,
              data: input.data,
              ...(input.format ? { format: input.format } : {}),
              artifactPath,
            },
            [input.data],
          ),
        // The worker reports per-field counts, not per-widget pages; an
        // import may touch widgets on any page, so every page's annotation
        // collection is conservatively invalidated.
        impacts: (_result: FormImportResult, materialized) => allPageImpacts(materialized),
      },
      signal,
    );
  }

  async repairForm(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; bakeAppearances: boolean },
    signal?: AbortSignal,
  ): Promise<FormRepairResult> {
    return this.runFormMutation(
      ctx,
      {
        docId: input.docId,
        layerName: input.layerName,
        tag: 'forms.repair',
        auditKind: 'form.repair',
        build: (jobId, artifactPath) =>
          wirePack({
            kind: 'forms.repair' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            bakeAppearances: input.bakeAppearances,
            artifactPath,
          }),
        // Repair may bake appearances for widgets anywhere in the document.
        impacts: (_result: FormRepairResult, materialized) => allPageImpacts(materialized),
      },
      signal,
    );
  }

  async createFormField(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; draft: FormFieldDraft },
    signal?: AbortSignal,
  ): Promise<FormFieldCreateResult> {
    return this.runFormMutation(
      ctx,
      {
        docId: input.docId,
        layerName: input.layerName,
        tag: 'forms.createField',
        auditKind: 'form.createField',
        build: (jobId, artifactPath) =>
          wirePack({
            kind: 'forms.createField' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            draft: input.draft,
            artifactPath,
          }),
        // Inline placements birth widget annotations on their pages.
        impacts: (result: FormFieldCreateResult) => widgetImpacts(result.field.widgets, 'create'),
      },
      signal,
    );
  }

  async updateFormField(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; ref: FormFieldRef; patch: FormFieldPatch },
    signal?: AbortSignal,
  ): Promise<FormFieldUpdateResult> {
    return this.runFormMutation(
      ctx,
      {
        docId: input.docId,
        layerName: input.layerName,
        tag: 'forms.updateField',
        auditKind: 'form.updateField',
        build: (jobId, artifactPath) =>
          wirePack({
            kind: 'forms.updateField' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            ref: input.ref,
            patch: input.patch,
            artifactPath,
          }),
        // Option/value re-syncs can regenerate appearances on every widget
        // of the field, so all hosting pages are treated as updated.
        impacts: (result: FormFieldUpdateResult) => widgetImpacts(result.field.widgets, 'update'),
      },
      signal,
    );
  }

  async deleteFormField(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; ref: FormFieldRef },
    signal?: AbortSignal,
  ): Promise<FormFieldDeleteResult> {
    return this.runFormMutation(
      ctx,
      {
        docId: input.docId,
        layerName: input.layerName,
        tag: 'forms.deleteField',
        auditKind: 'form.deleteField',
        build: (jobId, artifactPath) =>
          wirePack({
            kind: 'forms.deleteField' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            ref: input.ref,
            artifactPath,
          }),
        // The cascade removes widget annotations — /Annots index space
        // shifts on those pages ('delete' also advances the generation).
        impacts: (result: FormFieldDeleteResult) => widgetImpacts(result.removedWidgets, 'delete'),
      },
      signal,
    );
  }

  async attachFormWidget(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      ref: FormFieldRef;
      widget: FormWidgetRef;
      onState?: string;
    },
    signal?: AbortSignal,
  ): Promise<FormWidgetLinkResult> {
    return this.runFormMutation(
      ctx,
      {
        docId: input.docId,
        layerName: input.layerName,
        tag: 'forms.attachWidget',
        auditKind: 'form.attachWidget',
        build: (jobId, artifactPath) =>
          wirePack({
            kind: 'forms.attachWidget' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            ref: input.ref,
            widget: input.widget,
            ...(input.onState ? { onState: input.onState } : {}),
            artifactPath,
          }),
        impacts: () => widgetImpacts([input.widget], 'update'),
      },
      signal,
    );
  }

  async detachFormWidget(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; ref: FormFieldRef; widget: FormWidgetRef },
    signal?: AbortSignal,
  ): Promise<FormWidgetLinkResult> {
    return this.runFormMutation(
      ctx,
      {
        docId: input.docId,
        layerName: input.layerName,
        tag: 'forms.detachWidget',
        auditKind: 'form.detachWidget',
        build: (jobId, artifactPath) =>
          wirePack({
            kind: 'forms.detachWidget' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            ref: input.ref,
            widget: input.widget,
            artifactPath,
          }),
        impacts: () => widgetImpacts([input.widget], 'update'),
      },
      signal,
    );
  }

  /**
   * The shared form mutation rail: enqueue on the layer write queue,
   * materialize, run the worker job, upload the artifact, and commit the
   * per-page bumps derived from the result's widget change report. The
   * response is the audited payload — same invariant as annotations.
   */
  private async runFormMutation<TResult extends { meta: MutationMeta }>(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      tag: string;
      auditKind: AuditMutationKind;
      build: (jobId: WorkerJobId, artifactPath: string) => WirePack<WorkerRequest>;
      impacts: (result: TResult, materialized: MaterializedLayer) => FormPageImpact[];
    },
    signal?: AbortSignal,
  ): Promise<TResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const materialized = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      const { layer } = materialized;
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.requirePool().run(
          input.docId,
          (jobId) => input.build(jobId, artifactPath),
          signal,
        );
        if (payload.tag !== input.tag) {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected ${input.tag} payload: ${payload.tag}`,
          );
        }
        const result = (payload as unknown as { result: TResult }).result;
        return this.persistFormMutation(ctx, input.docId, input.layerName, layer, {
          auditKind: input.auditKind,
          impacts: input.impacts(result, materialized),
          result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  private async persistFormMutation<TResult extends { meta: MutationMeta }>(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      auditKind: AuditMutationKind;
      impacts: FormPageImpact[];
      result: TResult;
      artifact: LayerArtifactInput;
    },
  ): Promise<TResult> {
    const nextVersion = layer.currentVersion + 1;
    const artifactKey = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
    const uploaded = await this.uploadLayerArtifact(artifactKey, input.artifact);
    const committed = await this.commitFormMutation({
      ctx,
      docId,
      layerName,
      layer,
      kind: input.auditKind,
      impacts: dedupeImpacts(input.impacts),
      artifactKey,
      artifactSha: uploaded.sha256,
      artifactSize: uploaded.size,
      nextVersion,
      finalizePayload: (durable) =>
        this.finalizeFormResult(docId, layerName, input.result, durable),
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    // The response IS the audited payload — one fact for caller and history.
    return committed.payload as TResult;
  }

  /**
   * Turn the worker's session-relative result (whose `meta` is empty by
   * construction) into the FINALIZED wire result: decorated per-page states
   * and the real cacheDelta from the committed version bumps.
   */
  private finalizeFormResult<TResult extends { meta: MutationMeta }>(
    docId: string,
    layerName: string,
    raw: TResult,
    durable: CommittedFormMutation,
  ): TResult {
    const cacheDelta = this.layerState.buildCacheDelta({
      docId,
      layerName,
      previousDocVersion: durable.previousLayerDocVersion,
      docVersion: durable.layerDocVersion,
      pages: durable.pages,
    });
    return {
      ...raw,
      meta: {
        ...raw.meta,
        affectedPages: durable.pages.map((page) =>
          this.layerState.decorateLayerPageState(docId, layerName, page),
        ),
        cacheDelta,
      },
    };
  }

  /**
   * Form commit: advance the layer's `doc_version` (a new artifact always
   * exists) and bump the affected pages' annotation counters per their
   * impact kind. Field-plane-only mutations (rename, unplaced create)
   * legitimately touch zero pages — the layer still advances so the new
   * artifact becomes current.
   */
  private async commitFormMutation(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    kind: AuditMutationKind;
    impacts: FormPageImpact[];
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
    finalizePayload: (durable: CommittedFormMutation) => unknown;
  }): Promise<{ durable: CommittedFormMutation; payload: unknown; auditId: number }> {
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const currentLayer = await this.readLayerForCommit(trx, input.layer);

        const nextPages: DurablePageRow[] = [];
        for (const impact of input.impacts) {
          const page = await trx
            .selectFrom('layer_pages')
            .selectAll()
            .where('layer_id', '=', input.layer.id)
            .where('page_object_number', '=', impact.pageObjectNumber)
            .executeTakeFirst();
          if (!page) {
            throw new EngineError(
              EngineErrorCode.WireFormat,
              `form mutation reported unknown page object number ${impact.pageObjectNumber}`,
            );
          }
          const bumps = this.layerState.mutationBumps(impact.kind, {
            hasWeakAnnotations: Boolean(page.has_weak_annotations),
          });
          nextPages.push({
            pageObjectNumber: Number(page.page_object_number),
            contentVersion: Number(page.content_version) + (bumps.bumpContentVersion ? 1 : 0),
            annotationVersion:
              Number(page.annotation_version) + (bumps.bumpAnnotationVersion ? 1 : 0),
            annotationGeneration:
              Number(page.annotation_generation) + (bumps.bumpAnnotationGeneration ? 1 : 0),
            // Widgets are strong annotations; the page's weak truth is
            // untouched by any form mutation.
            hasWeakAnnotations: Boolean(page.has_weak_annotations),
            updatedAt: now,
          });
        }

        const previousLayerDocVersion = Number(currentLayer.doc_version);
        const layerDocVersion = previousLayerDocVersion + 1;

        const durable: CommittedFormMutation = {
          pages: nextPages,
          previousLayerDocVersion,
          layerDocVersion,
        };
        // Finalize BEFORE the audit append so the row stores exactly what
        // the caller will receive.
        const payload = input.finalizePayload(durable);

        const auditEvent = makeAuditEvent({
          ctx: input.ctx,
          docId: input.docId,
          layer: input.layer,
          layerName: input.layerName,
          kind: input.kind,
          pageObjectNumber: null,
          affectedPages: nextPages.map((page) => page.pageObjectNumber),
          artifactVersion: input.nextVersion,
          artifactKey: input.artifactKey,
          artifactSha: input.artifactSha,
          artifactSize: input.artifactSize,
          payload,
          ts: now,
        });
        const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;

        await this.writeLayerAdvance(trx, input, { doc_version: layerDocVersion }, auditId, now);

        for (const page of nextPages) {
          await trx
            .updateTable('layer_pages')
            .set({
              content_version: page.contentVersion,
              annotation_version: page.annotationVersion,
              annotation_generation: page.annotationGeneration,
              updated_at: now,
            })
            .where('layer_id', '=', input.layer.id)
            .where('page_object_number', '=', page.pageObjectNumber)
            .execute();
        }

        return { durable, payload, auditId };
      });
  }

  private async prepareLayerMutation(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
  ): Promise<MaterializedLayer> {
    const documentService = this.requireDocumentService();
    await documentService.getLayerManifest(ctx, docId, layerName);
    const materialized = await this.materializeLayerForWrite(ctx, docId, layerName);
    // THE FENCE ALIGNMENT: the worker session must embody exactly the layer
    // row we just read before it may apply this mutation. A session left
    // behind by an earlier open is a stale materialization whenever another
    // replica advanced the layer — applying onto it and saving would emit
    // an artifact that silently drops the remote writes. After alignment,
    // the commit-time version CAS is a true fence: it can only fail on a
    // remote commit inside the prepare→commit window (→ rebase & retry).
    await documentService.ensureLayerFreshOnPool(
      ctx,
      docId,
      layerName,
      materialized.layer.currentVersion,
      null,
      // Write alignment: records the engine generation this session lives
      // under, so a mid-commit engine respawn can never get a recreated
      // session blessed with the committed version (advanceLayerSession).
      { forWrite: true },
    );
    return materialized;
  }

  private async persistAnnotationMutation<
    TResult extends
      | AnnotationCreateResult
      | AnnotationUpdateResult
      | AnnotationDeleteResult
      | AnnotationMoveResult,
  >(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    kind: MutationImpactKind,
    input: {
      result: TResult;
      artifact: LayerArtifactInput;
    },
  ): Promise<TResult> {
    const nextVersion = layer.currentVersion + 1;
    const artifactKey = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
    const uploaded = await this.uploadLayerArtifact(artifactKey, input.artifact);
    const committed = await this.commitAnnotationMutation({
      ctx,
      docId,
      layerName,
      layer,
      pageObjectNumber: requireSingleAffectedPage(input.result.meta.affectedPages).pageObjectNumber,
      kind,
      artifactKey,
      artifactSha: uploaded.sha256,
      artifactSize: uploaded.size,
      nextVersion,
      hasWeakAnnotations: requireKnownWeakAnnotationBoolean(
        requireSingleAffectedPage(input.result.meta.affectedPages),
      ),
      finalizePayload: (durable) =>
        this.finalizeAnnotationResult(docId, layerName, input.result, durable),
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    // The response IS the audited payload — one fact for caller and history.
    return committed.payload as TResult;
  }

  /**
   * Turn the worker's session-relative result into the FINALIZED wire result:
   * cloud-stable revision tokens (the bridge's deterministic
   * `cloud:layer:{doc}:{layer}` scope + the durable generation) and the real
   * cacheDelta from the committed version bumps. Pure and synchronous — it
   * runs inside the commit transaction so the audit row can store its output.
   */
  private finalizeAnnotationResult<
    TResult extends
      | AnnotationCreateResult
      | AnnotationUpdateResult
      | AnnotationDeleteResult
      | AnnotationMoveResult,
  >(docId: string, layerName: string, raw: TResult, durable: CommittedAnnotationMutation): TResult {
    const cacheDelta = this.layerState.buildCacheDelta({
      docId,
      layerName,
      previousDocVersion: durable.previousLayerDocVersion,
      docVersion: durable.layerDocVersion,
      pages: [durable.page],
    });
    const pageState = this.layerState.decorateLayerPageState(docId, layerName, durable.page);
    const result = {
      ...raw,
      meta: {
        ...raw.meta,
        cacheDelta,
        affectedPages: [pageState],
        weakRefsInvalidated: durable.weakRefsInvalidated,
        shouldRefetch: durable.weakRefsInvalidated
          ? { reason: 'weakRefsInvalidated' as const }
          : null,
      },
    };
    return this.requireRevisionBridge().decorateAnnotationMutationResult([pageState], result);
  }

  private async persistPageMove(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      result: PageMoveResult;
      artifact: LayerArtifactInput;
    },
  ): Promise<PageMoveResult> {
    const nextVersion = layer.currentVersion + 1;
    const artifactKey = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
    const uploaded = await this.uploadLayerArtifact(artifactKey, input.artifact);
    // The commit assembles, audits, and returns the finalized result (the
    // worker's layout + the coherence pins it just computed) — the response
    // is the audited payload, byte for byte.
    const committed = await this.commitPageStructure({
      ctx,
      docId,
      layerName,
      layer,
      kind: 'pages.move',
      layout: input.result.layout,
      // Every page's position is touched by a reorder.
      affectedPages: input.result.layout.pages.map((page) => page.pageObjectNumber),
      artifactKey,
      artifactSha: uploaded.sha256,
      artifactSize: uploaded.size,
      nextVersion,
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    return committed.result;
  }

  /**
   * Rotate shares the move commit EXACTLY (the corrected model: rotation is
   * presentation metadata — `doc_version` + `layout_version` bump, no
   * `layer_pages` touch, every per-page cache stays warm). Only the audit
   * kind and the affected-page set differ.
   */
  private async persistPageRotate(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      result: PageRotateResult;
      affectedPages: PageObjectNumber[];
      artifact: LayerArtifactInput;
    },
  ): Promise<PageRotateResult> {
    const nextVersion = layer.currentVersion + 1;
    const artifactKey = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
    const uploaded = await this.uploadLayerArtifact(artifactKey, input.artifact);
    const committed = await this.commitPageStructure({
      ctx,
      docId,
      layerName,
      layer,
      kind: 'pages.rotate',
      layout: input.result.layout,
      affectedPages: input.affectedPages,
      artifactKey,
      artifactSha: uploaded.sha256,
      artifactSize: uploaded.size,
      nextVersion,
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    return committed.result;
  }

  private async persistPageFlatten(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      result: PageFlattenResult & { meta: MutationMeta };
      artifact: LayerArtifactInput;
    },
  ): Promise<PageFlattenResult> {
    const nextVersion = layer.currentVersion + 1;
    const artifactKey = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
    const uploaded = await this.uploadLayerArtifact(artifactKey, input.artifact);
    const committed = await this.commitPageFlatten({
      ctx,
      docId,
      layerName,
      layer,
      raw: input.result,
      artifactKey,
      artifactSha: uploaded.sha256,
      artifactSize: uploaded.size,
      nextVersion,
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    return committed.result;
  }

  private async persistRedactionApply(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      result: RedactionApplyResult & { meta: MutationMeta };
      artifact: LayerArtifactInput;
    },
  ): Promise<RedactionApplyResult> {
    const nextVersion = layer.currentVersion + 1;
    const artifactKey = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
    const uploaded = await this.uploadLayerArtifact(artifactKey, input.artifact);
    const committed = await this.commitRedactionApply({
      ctx,
      docId,
      layerName,
      layer,
      raw: input.result,
      artifactKey,
      artifactSha: uploaded.sha256,
      artifactSize: uploaded.size,
      nextVersion,
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    return committed.result;
  }

  private async persistPageDelete(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      result: PageDeleteResult;
      deletedPages: PageObjectNumber[];
      artifact: LayerArtifactInput;
    },
  ): Promise<PageDeleteResult> {
    const nextVersion = layer.currentVersion + 1;
    const artifactKey = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
    const uploaded = await this.uploadLayerArtifact(artifactKey, input.artifact);
    const committed = await this.commitPageDelete({
      ctx,
      docId,
      layerName,
      layer,
      layout: input.result.layout,
      deletedPages: input.deletedPages,
      artifactKey,
      artifactSha: uploaded.sha256,
      artifactSize: uploaded.size,
      nextVersion,
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    return committed.result;
  }

  private async persistMetadataUpdate(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      result: MetadataUpdateResult;
      artifact: LayerArtifactInput;
    },
  ): Promise<MetadataUpdateResult> {
    const nextVersion = layer.currentVersion + 1;
    const artifactKey = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
    const uploaded = await this.uploadLayerArtifact(artifactKey, input.artifact);
    // The commit assembles, audits, and returns the finalized result (the
    // worker's re-read metadata + the coherence pins it just computed) — the
    // response is the audited payload, byte for byte.
    const committed = await this.commitMetadataUpdate({
      ctx,
      docId,
      layerName,
      layer,
      metadata: input.result.metadata,
      artifactKey,
      artifactSha: uploaded.sha256,
      artifactSize: uploaded.size,
      nextVersion,
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    return committed.result;
  }

  private async uploadLayerArtifact(
    artifactKey: string,
    artifact: LayerArtifactInput,
  ): Promise<{ sha256: string; size: number }> {
    if ('path' in artifact) {
      const info = await stat(artifact.path);
      if (info.size <= 0) {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `layer artifact file is empty: ${artifact.path}`,
        );
      }
      const putResult = await this.requireStorage().put(
        artifactKey,
        createReadStream(artifact.path),
        {
          contentLength: info.size,
        },
      );
      return { sha256: putResult.sha256, size: info.size };
    }

    const artifactBytes = new Uint8Array(artifact.bytes);
    if (artifactBytes.byteLength !== artifact.size) {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `layer artifact size mismatch: payload=${artifactBytes.byteLength}, declared=${artifact.size}`,
      );
    }
    const putResult = await this.requireStorage().put(artifactKey, artifactBytes, {
      contentLength: artifact.size,
    });
    return { sha256: putResult.sha256, size: artifact.size };
  }

  private async withTempWorkerFile<T>(
    prefix: string,
    filename: string,
    fn: (path: string) => Promise<T>,
  ): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), `embedpdf-${prefix}-`));
    const path = join(dir, filename);
    try {
      return await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async rewriteRefForWorker(
    docId: string,
    layerName: string,
    layer: LayerRow,
    ref: AnnotationRef,
    signal?: AbortSignal,
  ): Promise<AnnotationRef> {
    if (ref.kind !== 'index') return ref;

    const page = await this.requireLayerPage(layer.id, ref.pageObjectNumber);
    const durablePageState = this.layerState.decorateLayerPageState(docId, layerName, page);
    // Refs minted by SHARED base reads carry the base revision scope;
    // the generation check still gates staleness (see the bridge's doc).
    this.requireRevisionBridge().validateClientIndexRef(durablePageState, ref, {
      aliasDocSessionIds: [this.layerState.baseRevisionScopeId(docId)],
    });
    const workerPageState = await this.loadWorkerPageState(
      docId,
      layerName,
      ref.pageObjectNumber,
      signal,
    );
    return this.requireRevisionBridge().rewriteIndexRefForWorker(workerPageState, ref);
  }

  private async loadWorkerPageState(
    docId: string,
    layerName: string,
    pageObjectNumber: PageObjectNumber,
    signal?: AbortSignal,
  ): Promise<PageState> {
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'annotations.listFullPage' as const,
        jobId,
        docId,
        layerName,
        pageObjectNumber,
      });
    const payload = await this.requirePool().run(docId, build, signal);
    if (payload.tag !== 'annotations.listFullPage') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected annotations.listFullPage payload while rewriting index ref: ${payload.tag}`,
      );
    }
    return payload.snapshot.pageState;
  }

  private async requireLayerPage(
    layerId: string,
    pageObjectNumber: PageObjectNumber,
  ): Promise<DurablePageRow> {
    const pages = await this.layerState.repos.layerPages.findByLayer(layerId);
    const page = pages.find((candidate) => candidate.pageObjectNumber === pageObjectNumber);
    if (!page) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `layer page ${pageObjectNumber} not found for layer ${layerId}`,
      );
    }
    return page;
  }

  private async assertWeakAnnotationStructuralEditAllowed(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      layer: LayerRow;
      pageObjectNumber: PageObjectNumber;
    },
  ): Promise<void> {
    const page = await this.requireLayerPage(input.layer.id, input.pageObjectNumber);
    if (!page.hasWeakAnnotations) {
      return;
    }
    if (!this.weakAnnotationSessions) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        'weak annotation session service is not configured',
      );
    }
    await this.weakAnnotationSessions.assertSoleEditorForWeakPage({
      tenantId: ctx.tenantId,
      docId: input.docId,
      layerName: input.layerName,
      sub: ctx.sub,
      pageObjectNumber: input.pageObjectNumber,
    });
  }

  private async commitAnnotationMutation(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    pageObjectNumber: number;
    kind: MutationImpactKind;
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
    hasWeakAnnotations: boolean;
    /**
     * Builds the FINALIZED result (cloud-stable revision tokens, real
     * cacheDelta) from the in-transaction durable state. Its return is what
     * the audit row stores AND what the caller receives — the invariant is
     * that the audited payload is byte-identical to the response: what we
     * tell the caller is what we tell history (and, later, every remote
     * event subscriber).
     */
    finalizePayload: (durable: CommittedAnnotationMutation) => unknown;
  }): Promise<{ durable: CommittedAnnotationMutation; payload: unknown; auditId: number }> {
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        // Plain read — values feed the next-version computation. The FENCE
        // is not here: it is the guarded UPDATE below, the only check that
        // is atomic with the write (a SELECT takes no lock; two overlapping
        // transactions can both pass a read-then-check).
        const currentLayer = await trx
          .selectFrom('layers')
          .select(['current_version', 'doc_version'])
          .where('id', '=', input.layer.id)
          .executeTakeFirst();
        if (!currentLayer) {
          throw new EngineError(EngineErrorCode.NotFound, `layer not found: ${input.layer.id}`);
        }

        const page = await trx
          .selectFrom('layer_pages')
          .selectAll()
          .where('layer_id', '=', input.layer.id)
          .where('page_object_number', '=', input.pageObjectNumber)
          .executeTakeFirst();
        if (!page) {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `layer page ${input.pageObjectNumber} not found for layer ${input.layer.id}`,
          );
        }

        const bumps = this.layerState.mutationBumps(input.kind, {
          hasWeakAnnotations: Boolean(page.has_weak_annotations),
        });
        const nextPage: DurablePageRow = {
          pageObjectNumber: Number(page.page_object_number),
          contentVersion: Number(page.content_version) + (bumps.bumpContentVersion ? 1 : 0),
          annotationVersion:
            Number(page.annotation_version) + (bumps.bumpAnnotationVersion ? 1 : 0),
          annotationGeneration:
            Number(page.annotation_generation) + (bumps.bumpAnnotationGeneration ? 1 : 0),
          hasWeakAnnotations: input.hasWeakAnnotations,
          updatedAt: now,
        };

        const previousLayerDocVersion = Number(currentLayer.doc_version);
        const layerDocVersion = previousLayerDocVersion + (bumps.bumpLayerDocVersion ? 1 : 0);

        const durable: CommittedAnnotationMutation = {
          page: nextPage,
          weakRefsInvalidated: bumps.weakRefsInvalidated,
          previousLayerDocVersion,
          layerDocVersion,
        };
        // Finalize BEFORE the audit append so the row stores exactly what the
        // caller will receive (cloud-stable tokens + real cacheDelta), never
        // the worker's session-relative draft.
        const payload = input.finalizePayload(durable);

        const auditEvent = makeAuditEvent({
          ctx: input.ctx,
          docId: input.docId,
          layer: input.layer,
          layerName: input.layerName,
          kind: `annot.${input.kind}` as AuditEvent['kind'],
          pageObjectNumber: input.pageObjectNumber,
          affectedPages: [input.pageObjectNumber],
          artifactVersion: input.nextVersion,
          artifactKey: input.artifactKey,
          artifactSha: input.artifactSha,
          artifactSize: input.artifactSize,
          payload,
          ts: now,
        });
        const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;

        await this.guardedVersionBump(trx, input.layer, {
          doc_version: layerDocVersion,
          current_version: input.nextVersion,
          current_artifact_key: input.artifactKey,
          current_artifact_sha: input.artifactSha,
          current_artifact_size: input.artifactSize,
          ...(auditId > 0 ? { last_audit_id: auditId } : {}),
          updated_at: now,
        });

        await trx
          .updateTable('layer_pages')
          .set({
            content_version: nextPage.contentVersion,
            annotation_version: nextPage.annotationVersion,
            annotation_generation: nextPage.annotationGeneration,
            has_weak_annotations: nextPage.hasWeakAnnotations ? 1 : 0,
            updated_at: now,
          })
          .where('layer_id', '=', input.layer.id)
          .where('page_object_number', '=', input.pageObjectNumber)
          .execute();

        return { durable, payload, auditId };
      });
  }

  /**
   * Shared commit for the page-structure ops that keep the page SET intact
   * (move + rotate). Both have the same shape: the layer's `doc_version` and
   * `layout_version` advance, `layer_pages` rows are left entirely untouched
   * (display order and rotation live in the artifact, read back via /layout),
   * and every per-page content/annotation cache stays warm.
   */
  private async commitPageStructure(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    kind: 'pages.move' | 'pages.rotate';
    /** The worker's post-mutation layout — becomes `result.layout`. */
    layout: PageListSnapshot;
    affectedPages: PageObjectNumber[];
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
  }): Promise<{
    result: { layout: PageListSnapshot; cache: PageStructureCache };
    auditId: number;
  }> {
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const currentLayer = await this.readLayerForCommit(trx, input.layer);

        // The worker's layout IS the new order; validate its page set against
        // the durable rows before trusting it.
        const pageOrder = input.layout.pages.map((page) => page.pageObjectNumber);
        const rows = await trx
          .selectFrom('layer_pages')
          .select('page_object_number')
          .where('layer_id', '=', input.layer.id)
          .execute();
        if (rows.length !== pageOrder.length) {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `${input.kind} returned ${pageOrder.length} pages for ${rows.length} layer page rows`,
          );
        }
        const known = new Set(rows.map((row) => Number(row.page_object_number)));
        for (const pageObjectNumber of pageOrder) {
          if (!known.has(pageObjectNumber)) {
            throw new EngineError(
              EngineErrorCode.WireFormat,
              `${input.kind} returned unknown page object number ${pageObjectNumber}`,
            );
          }
        }

        const previousDocVersion = Number(currentLayer.doc_version);
        const versions: PageStructureCache = {
          previousDocVersion,
          docVersion: previousDocVersion + 1,
          layoutVersion: Number(currentLayer.layout_version) + 1,
        };

        // The finalized result — audited and returned IDENTICALLY: what we
        // tell the caller is what we tell history (and remote subscribers).
        const result = { layout: input.layout, cache: versions };

        const auditEvent = makeAuditEvent({
          ctx: input.ctx,
          docId: input.docId,
          layer: input.layer,
          layerName: input.layerName,
          kind: input.kind,
          pageObjectNumber: null,
          affectedPages: input.affectedPages,
          artifactVersion: input.nextVersion,
          artifactKey: input.artifactKey,
          artifactSha: input.artifactSha,
          artifactSize: input.artifactSize,
          payload: result,
          ts: now,
        });
        const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;

        await this.writeLayerAdvance(
          trx,
          input,
          { doc_version: versions.docVersion, layout_version: versions.layoutVersion },
          auditId,
          now,
        );

        return { result, auditId };
      });
  }

  /**
   * Delete commit: the only page-structure op that mutates the page SET. On
   * top of the shared version bumps it removes the deleted pages'
   * `layer_pages` rows and any weak-annotation-session claims on them
   * (sessions themselves survive — they may hold other pages). Surviving
   * pages' rows are untouched, so their pins and revisions stay warm.
   */
  private async commitPageDelete(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    /** The worker's post-delete layout (survivors) — becomes `result.layout`. */
    layout: PageListSnapshot;
    deletedPages: PageObjectNumber[];
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
  }): Promise<{
    result: { layout: PageListSnapshot; cache: PageStructureCache };
    auditId: number;
  }> {
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const currentLayer = await this.readLayerForCommit(trx, input.layer);

        const rows = await trx
          .selectFrom('layer_pages')
          .select('page_object_number')
          .where('layer_id', '=', input.layer.id)
          .execute();
        const known = new Set(rows.map((row) => Number(row.page_object_number)));
        const deleted = new Set(input.deletedPages);
        const survivorOrder = input.layout.pages.map((page) => page.pageObjectNumber);
        if (rows.length !== survivorOrder.length + input.deletedPages.length) {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `pages.delete returned ${survivorOrder.length} survivors for ${rows.length} layer page rows minus ${input.deletedPages.length} deleted`,
          );
        }
        for (const pageObjectNumber of input.deletedPages) {
          if (!known.has(pageObjectNumber)) {
            throw new EngineError(
              EngineErrorCode.WireFormat,
              `pages.delete removed unknown page object number ${pageObjectNumber}`,
            );
          }
        }
        for (const pageObjectNumber of survivorOrder) {
          if (!known.has(pageObjectNumber) || deleted.has(pageObjectNumber)) {
            throw new EngineError(
              EngineErrorCode.WireFormat,
              `pages.delete returned unexpected surviving page object number ${pageObjectNumber}`,
            );
          }
        }

        await trx
          .deleteFrom('layer_pages')
          .where('layer_id', '=', input.layer.id)
          .where('page_object_number', 'in', input.deletedPages)
          .execute();

        // Weak-annotation sessions of THIS layer lose their claims on the
        // deleted pages (the guard ran pre-worker; this is the cleanup).
        const sessions = await trx
          .selectFrom('weak_annotation_sessions')
          .select('id')
          .where('tenant_id', '=', input.ctx.tenantId)
          .where('doc_id', '=', input.docId)
          .where('layer_name', '=', input.layerName)
          .execute();
        if (sessions.length > 0) {
          await trx
            .deleteFrom('weak_annotation_session_pages')
            .where(
              'session_id',
              'in',
              sessions.map((session) => session.id),
            )
            .where('page_object_number', 'in', input.deletedPages)
            .execute();
        }

        const previousDocVersion = Number(currentLayer.doc_version);
        const versions: PageStructureCache = {
          previousDocVersion,
          docVersion: previousDocVersion + 1,
          layoutVersion: Number(currentLayer.layout_version) + 1,
        };

        // The finalized result — audited and returned IDENTICALLY: what we
        // tell the caller is what we tell history (and remote subscribers).
        const result = { layout: input.layout, cache: versions };

        const auditEvent = makeAuditEvent({
          ctx: input.ctx,
          docId: input.docId,
          layer: input.layer,
          layerName: input.layerName,
          kind: 'pages.delete',
          pageObjectNumber: null,
          affectedPages: input.deletedPages,
          artifactVersion: input.nextVersion,
          artifactKey: input.artifactKey,
          artifactSha: input.artifactSha,
          artifactSize: input.artifactSize,
          payload: result,
          ts: now,
        });
        const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;

        await this.writeLayerAdvance(
          trx,
          input,
          { doc_version: versions.docVersion, layout_version: versions.layoutVersion },
          auditId,
          now,
        );

        return { result, auditId };
      });
  }

  /**
   * Flatten commit: the page registry/layout stays intact, while every page
   * whose native outcome may have changed advances both cache planes and the
   * annotation index generation. Unknown post-failure weak state preserves
   * the prior durable `true`/`false` conservatively.
   */
  private async commitPageFlatten(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    raw: PageFlattenResult & { meta: MutationMeta };
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
  }): Promise<{ result: PageFlattenResult; auditId: number }> {
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const currentLayer = await this.readLayerForCommit(trx, input.layer);
        const weakStateByPage = new Map(
          input.raw.meta.affectedPages.map((page) => [
            page.pageObjectNumber,
            page.weakAnnotationState,
          ]),
        );
        const affected = [...weakStateByPage.keys()];
        if (affected.length === 0) {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            'pages.flatten returned mutation metadata without an affected page',
          );
        }

        const nextPages: DurablePageRow[] = [];
        for (const pageObjectNumber of affected) {
          const row = await trx
            .selectFrom('layer_pages')
            .selectAll()
            .where('layer_id', '=', input.layer.id)
            .where('page_object_number', '=', pageObjectNumber)
            .executeTakeFirst();
          if (!row) {
            throw new EngineError(
              EngineErrorCode.WireFormat,
              `pages.flatten reported unknown page object number ${pageObjectNumber}`,
            );
          }
          const weakState = weakStateByPage.get(pageObjectNumber);
          nextPages.push({
            pageObjectNumber,
            contentVersion: Number(row.content_version) + 1,
            annotationVersion: Number(row.annotation_version) + 1,
            annotationGeneration: Number(row.annotation_generation) + 1,
            hasWeakAnnotations:
              weakState?.kind === 'known'
                ? weakState.hasAnyWeakAnnotations
                : Boolean(row.has_weak_annotations),
            updatedAt: now,
          });
        }

        const previousLayerDocVersion = Number(currentLayer.doc_version);
        const durable: CommittedPageFlatten = {
          pages: nextPages,
          previousLayerDocVersion,
          layerDocVersion: previousLayerDocVersion + 1,
        };
        const result: PageFlattenResult = {
          ...input.raw,
          meta: {
            ...input.raw.meta,
            affectedPages: nextPages.map((page) =>
              this.layerState.decorateLayerPageState(input.docId, input.layerName, page),
            ),
            cacheDelta: this.layerState.buildCacheDelta({
              docId: input.docId,
              layerName: input.layerName,
              previousDocVersion: durable.previousLayerDocVersion,
              docVersion: durable.layerDocVersion,
              pages: nextPages,
            }),
          },
        };

        const auditEvent = makeAuditEvent({
          ctx: input.ctx,
          docId: input.docId,
          layer: input.layer,
          layerName: input.layerName,
          kind: 'pages.flatten',
          pageObjectNumber: null,
          affectedPages: affected,
          artifactVersion: input.nextVersion,
          artifactKey: input.artifactKey,
          artifactSha: input.artifactSha,
          artifactSize: input.artifactSize,
          payload: result,
          ts: now,
        });
        const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;

        await this.writeLayerAdvance(
          trx,
          input,
          { doc_version: durable.layerDocVersion },
          auditId,
          now,
        );
        for (const page of nextPages) {
          await trx
            .updateTable('layer_pages')
            .set({
              content_version: page.contentVersion,
              annotation_version: page.annotationVersion,
              annotation_generation: page.annotationGeneration,
              has_weak_annotations: page.hasWeakAnnotations ? 1 : 0,
              updated_at: now,
            })
            .where('layer_id', '=', input.layer.id)
            .where('page_object_number', '=', page.pageObjectNumber)
            .execute();
        }

        return { result, auditId };
      });
  }

  private async commitRedactionApply(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    raw: RedactionApplyResult & { meta: MutationMeta };
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
  }): Promise<{ result: RedactionApplyResult; auditId: number }> {
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const currentLayer = await this.readLayerForCommit(trx, input.layer);
        const weakStateByPage = new Map(
          input.raw.meta.affectedPages.map((page) => [
            page.pageObjectNumber,
            page.weakAnnotationState,
          ]),
        );
        const affected = [...weakStateByPage.keys()];
        if (affected.length === 0) {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            'redaction.apply returned mutation metadata without an affected page',
          );
        }

        // Content is destroyed and annotations are removed together, so
        // both version pins bump — identical to flatten.
        const nextPages: DurablePageRow[] = [];
        for (const pageObjectNumber of affected) {
          const row = await trx
            .selectFrom('layer_pages')
            .selectAll()
            .where('layer_id', '=', input.layer.id)
            .where('page_object_number', '=', pageObjectNumber)
            .executeTakeFirst();
          if (!row) {
            throw new EngineError(
              EngineErrorCode.WireFormat,
              `redaction.apply reported unknown page object number ${pageObjectNumber}`,
            );
          }
          const weakState = weakStateByPage.get(pageObjectNumber);
          nextPages.push({
            pageObjectNumber,
            contentVersion: Number(row.content_version) + 1,
            annotationVersion: Number(row.annotation_version) + 1,
            annotationGeneration: Number(row.annotation_generation) + 1,
            hasWeakAnnotations:
              weakState?.kind === 'known'
                ? weakState.hasAnyWeakAnnotations
                : Boolean(row.has_weak_annotations),
            updatedAt: now,
          });
        }

        const previousLayerDocVersion = Number(currentLayer.doc_version);
        const layerDocVersion = previousLayerDocVersion + 1;
        const result: RedactionApplyResult = {
          ...input.raw,
          meta: {
            ...input.raw.meta,
            affectedPages: nextPages.map((page) =>
              this.layerState.decorateLayerPageState(input.docId, input.layerName, page),
            ),
            cacheDelta: this.layerState.buildCacheDelta({
              docId: input.docId,
              layerName: input.layerName,
              previousDocVersion: previousLayerDocVersion,
              docVersion: layerDocVersion,
              pages: nextPages,
            }),
          },
        };

        const auditEvent = makeAuditEvent({
          ctx: input.ctx,
          docId: input.docId,
          layer: input.layer,
          layerName: input.layerName,
          kind: 'redaction.apply',
          pageObjectNumber: null,
          affectedPages: affected,
          artifactVersion: input.nextVersion,
          artifactKey: input.artifactKey,
          artifactSha: input.artifactSha,
          artifactSize: input.artifactSize,
          payload: result,
          ts: now,
        });
        const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;

        await this.writeLayerAdvance(trx, input, { doc_version: layerDocVersion }, auditId, now);
        for (const page of nextPages) {
          await trx
            .updateTable('layer_pages')
            .set({
              content_version: page.contentVersion,
              annotation_version: page.annotationVersion,
              annotation_generation: page.annotationGeneration,
              has_weak_annotations: page.hasWeakAnnotations ? 1 : 0,
              updated_at: now,
            })
            .where('layer_id', '=', input.layer.id)
            .where('page_object_number', '=', page.pageObjectNumber)
            .execute();
        }

        return { result, auditId };
      });
  }

  /** Re-read the layer inside the commit transaction and reject if another
   *  write advanced it since `prepareLayerMutation` (the optimistic check
   *  every structure commit shares). */
  private async readLayerForCommit(
    trx: Transaction<Schema>,
    layer: LayerRow,
  ): Promise<{ doc_version: number | bigint; layout_version: number | bigint }> {
    // Plain read — values feed the next-version computation. The FENCE is
    // the guarded UPDATE (see guardedVersionBump), never a SELECT check.
    const currentLayer = await trx
      .selectFrom('layers')
      .select(['current_version', 'doc_version', 'layout_version'])
      .where('id', '=', layer.id)
      .executeTakeFirst();
    if (!currentLayer) {
      throw new EngineError(EngineErrorCode.NotFound, `layer not found: ${layer.id}`);
    }
    return currentLayer;
  }

  /**
   * THE commit-time fence: advance the layer row if and only if
   * `current_version` is still exactly what this operation prepared
   * against — one conditional UPDATE, atomic on every engine.
   *
   * Why this is the only sound shape: a SELECT-then-check takes no lock,
   * so on Postgres (READ COMMITTED) two overlapping transactions can both
   * pass the check at version N; the second UPDATE then blocks on the
   * first's row lock and — with only `id` in the predicate — re-evaluates
   * against the NEW row and applies anyway, silently overwriting the
   * winner's artifact pointer. Putting the expected version IN the UPDATE
   * predicate makes that re-evaluation itself the fence: the loser matches
   * zero rows and surfaces a {@link LayerFenceConflict} (→ rebase).
   *
   * `current_version` is the layer's write-serial — every commit path
   * advances it through this method — so a successful guarded bump also
   * certifies every earlier read in this transaction: had any competing
   * commit landed since those reads, the predicate could not have matched.
   */
  private async guardedVersionBump(
    trx: Transaction<Schema>,
    layer: Pick<LayerRow, 'id' | 'currentVersion'>,
    set: Record<string, number | string | bigint | null>,
  ): Promise<void> {
    const result = await trx
      .updateTable('layers')
      .set(set)
      .where('id', '=', layer.id)
      .where('current_version', '=', layer.currentVersion)
      .executeTakeFirst();
    if (Number(result?.numUpdatedRows ?? 0) !== 1) {
      throw new LayerFenceConflict(
        `layer version moved while committing ${layer.id} (prepared=${layer.currentVersion})`,
      );
    }
  }

  /** Advance the layer row: version pointers, artifact epoch, and the
   *  realtime cursor (`last_audit_id` — written in the SAME transaction as
   *  the audit append, so the manifest's `auditHead` is gapless). */
  private async writeLayerAdvance(
    trx: Transaction<Schema>,
    input: {
      layer: LayerRow;
      nextVersion: number;
      artifactKey: string;
      artifactSha: string;
      artifactSize: number;
    },
    versions: {
      doc_version: number;
      layout_version?: number;
      metadata_version?: number;
      attachments_version?: number;
    },
    lastAuditId: number,
    now: number,
  ): Promise<void> {
    await this.guardedVersionBump(trx, input.layer, {
      ...versions,
      current_version: input.nextVersion,
      current_artifact_key: input.artifactKey,
      current_artifact_sha: input.artifactSha,
      current_artifact_size: input.artifactSize,
      ...(lastAuditId > 0 ? { last_audit_id: lastAuditId } : {}),
      updated_at: now,
    });
  }

  /** Ring the cross-replica doorbell — strictly AFTER the commit resolved,
   *  fire-and-forget (the doorbell must never fail or delay a response). */
  private publishMutation(ctx: LayerWriteContext, docId: string, auditId: number): void {
    if (!this.realtime || auditId <= 0) return;
    void this.realtime
      .publishMutation({ tenantId: ctx.tenantId, docId }, auditId)
      .catch(() => undefined);
  }

  /**
   * Post-commit bookkeeping shared by every layer write: advance the
   * worker session's fence entry to the version the commit just won (the
   * worker applied the mutation, so its in-memory state IS `nextVersion`),
   * then ring the realtime doorbell. Ordering matters — advance first, so
   * a subscriber reacting to the doorbell can never observe a session
   * whose fence entry is behind its own state.
   */
  private finishLayerCommit(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    nextVersion: number,
    artifactKey: string,
    auditId: number,
  ): void {
    // The commit won: its artifact is now referenced by the layer row —
    // claim it so the write wrapper's attempt cleanup leaves it alone.
    this.pendingAttemptKeys.get(layerWriteKey(ctx, docId, layerName))?.delete(artifactKey);
    this.requireDocumentService().advanceLayerSession(docId, layerName, nextVersion);
    this.publishMutation(ctx, docId, auditId);
  }

  /**
   * Per-ATTEMPT upload key for the artifact a mutation is about to save.
   * Never a bare version key: uploads happen BEFORE the commit CAS, and
   * two replicas racing the same `nextVersion` must not share an upload
   * target — the loser would overwrite the winner's committed bytes and
   * the layer would fail its sha check on the next open. Readers follow
   * `layers.current_artifact_key`, so the nonce is invisible to them.
   */
  private nextArtifactKey(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    nextVersion: number,
  ): string {
    const attempt = randomUUID().replace(/-/g, '').slice(0, 8);
    const key = StorageKeys.layerArtifactAttempt(
      ctx.tenantId,
      docId,
      layerName,
      nextVersion,
      attempt,
    );
    const writeKey = layerWriteKey(ctx, docId, layerName);
    const pending = this.pendingAttemptKeys.get(writeKey) ?? new Set<string>();
    pending.add(key);
    this.pendingAttemptKeys.set(writeKey, pending);
    return key;
  }

  private async commitMetadataUpdate(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    /** The worker's re-read metadata — becomes `result.metadata`. */
    metadata: MetadataUpdateResult['metadata'];
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
  }): Promise<{ result: MetadataUpdateResult; auditId: number }> {
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const currentLayer = await trx
          .selectFrom('layers')
          .select(['current_version', 'doc_version', 'metadata_version'])
          .where('id', '=', input.layer.id)
          .executeTakeFirst();
        if (!currentLayer) {
          throw new EngineError(EngineErrorCode.NotFound, `layer not found: ${input.layer.id}`);
        }
        // No SELECT-check here — the fence is writeLayerAdvance's guarded
        // UPDATE (atomic with the write; see guardedVersionBump).

        // A metadata write touches only the document Info dict — no page set,
        // no per-page versions, no display order. So `layer_pages` rows are
        // left entirely untouched; we only advance the layer version pointers.
        const previousLayerDocVersion = Number(currentLayer.doc_version);
        const layerDocVersion = previousLayerDocVersion + 1;
        // Metadata edit: bump the metadata pointer so the CDN-immutable
        // /metadata@metadataVersion leaf is re-fetched. Layout + per-page
        // content/annotation versions stay put (their caches stay warm).
        const metadataVersion = Number(currentLayer.metadata_version) + 1;

        // The finalized result — audited and returned IDENTICALLY: what we
        // tell the caller is what we tell history (and remote subscribers).
        const result: MetadataUpdateResult = {
          metadata: input.metadata,
          cache: {
            previousDocVersion: previousLayerDocVersion,
            docVersion: layerDocVersion,
            metadataVersion,
          },
        };

        const auditEvent = makeAuditEvent({
          ctx: input.ctx,
          docId: input.docId,
          layer: input.layer,
          layerName: input.layerName,
          kind: 'metadata.update',
          pageObjectNumber: null,
          affectedPages: [],
          artifactVersion: input.nextVersion,
          artifactKey: input.artifactKey,
          artifactSha: input.artifactSha,
          artifactSize: input.artifactSize,
          payload: result,
          ts: now,
        });
        const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;

        await this.writeLayerAdvance(
          trx,
          input,
          { doc_version: layerDocVersion, metadata_version: metadataVersion },
          auditId,
          now,
        );

        return { result, auditId };
      });
  }

  private async persistAttachmentMutation<
    R extends AttachmentCreateResult | AttachmentDeleteResult,
  >(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      kind: 'attachment.create' | 'attachment.delete';
      result: R;
      artifact: LayerArtifactInput;
    },
  ): Promise<R> {
    const nextVersion = layer.currentVersion + 1;
    const artifactKey = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
    const uploaded = await this.uploadLayerArtifact(artifactKey, input.artifact);
    const committed = await this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const currentLayer = await trx
          .selectFrom('layers')
          .select(['current_version', 'doc_version', 'attachments_version'])
          .where('id', '=', layer.id)
          .executeTakeFirst();
        if (!currentLayer) {
          throw new EngineError(EngineErrorCode.NotFound, `layer not found: ${layer.id}`);
        }
        // No SELECT-check here — the fence is writeLayerAdvance's guarded
        // UPDATE (atomic with the write; see guardedVersionBump).

        // Attachment writes touch only the catalog's name tree — no page
        // rows, no per-page versions. Advance the layer doc version plus
        // the dedicated attachments pin (the metadata_version design).
        const previousDocVersion = Number(currentLayer.doc_version);
        const docVersion = previousDocVersion + 1;
        const attachmentsVersion = Number(currentLayer.attachments_version) + 1;

        // The finalized result — audited and returned IDENTICALLY: what we
        // tell the caller is what we tell history (and remote subscribers).
        const result = {
          ...input.result,
          cache: { previousDocVersion, docVersion, attachmentsVersion },
        } as R;

        const auditEvent = makeAuditEvent({
          ctx,
          docId,
          layer,
          layerName,
          kind: input.kind,
          pageObjectNumber: null,
          affectedPages: [],
          artifactVersion: nextVersion,
          artifactKey,
          artifactSha: uploaded.sha256,
          artifactSize: uploaded.size,
          payload: result,
          ts: now,
        });
        const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;

        await this.writeLayerAdvance(
          trx,
          {
            layer,
            nextVersion,
            artifactKey,
            artifactSha: uploaded.sha256,
            artifactSize: uploaded.size,
          },
          { doc_version: docVersion, attachments_version: attachmentsVersion },
          auditId,
          now,
        );

        return { result, auditId };
      });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    return committed.result;
  }

  private enqueueLayerWrite<T>(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    op: () => Promise<T>,
  ): Promise<T> {
    const key = layerWriteKey(ctx, docId, layerName);
    const previous = this.layerWriteQueues.get(key) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(() => this.runWithRebase(ctx, docId, layerName, op));

    const queueEntry = operation
      .catch(() => undefined)
      .finally(() => {
        if (this.layerWriteQueues.get(key) === queueEntry) {
          this.layerWriteQueues.delete(key);
        }
      });

    this.layerWriteQueues.set(key, queueEntry);
    return operation;
  }

  /**
   * Rebase-and-retry around one queued layer write. A {@link
   * LayerFenceConflict} means a REMOTE replica committed between this op's
   * prepare and commit — the local worker session now holds dirty state
   * derived from a superseded version, and the op's own artifact lost the
   * CAS. Recovery is mechanical because wire ops are semantic: drop the
   * stale session (invalidate → the re-run's prepare reloads from the new
   * durable head), re-apply, re-commit. One retry: two consecutive fence
   * losses under the per-process queue means pathological external write
   * pressure — surface the conflict to the client (it is retryable).
   *
   * Two guarantees beyond the retry itself:
   *
   * - **No ghost writes.** ANY escaping failure invalidates the session:
   *   the worker may have applied a mutation whose commit never landed,
   *   and a later successful write would otherwise serialize that ghost
   *   into its artifact. Invalidation is cheap (one reload on next touch)
   *   and unconditional — cheaper than proving which failures are safe.
   * - **A visible dirty window.** The whole op runs under the document
   *   service's write marker, so reads park instead of serving
   *   uncommitted worker state as a clean materialization.
   */
  private async runWithRebase<T>(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    op: () => Promise<T>,
  ): Promise<T> {
    const documentService = this.requireDocumentService();
    const settle = documentService.beginLayerWrite(docId, layerName);
    try {
      try {
        return await op();
      } catch (err) {
        // Two retryable-once shapes, same mechanical recovery (invalidate
        // → re-prepare reloads durable truth → re-apply):
        //  - LayerFenceConflict: a REMOTE replica committed in our window.
        //  - DocNotOpen at APPLY: the op parked across an engine respawn
        //    (crash or recycle) and dispatched into a successor without
        //    the session. Nothing applied — no ghost — so the rerun is
        //    exactly the fence-conflict recovery. (The read-path twin is
        //    `runReadWithReopen`.)
        const parkedAcrossRespawn =
          err instanceof EngineError && err.code === EngineErrorCode.DocNotOpen;
        if (!(err instanceof LayerFenceConflict) && !parkedAcrossRespawn) throw err;
        if (err instanceof LayerFenceConflict) {
          // C5 instrument: one cross-replica write race per rebase. The
          // rate of this counter at N>1 replicas is the docAffinity
          // flip evidence.
          if (this.counters) this.counters.layerWriteConflicts += 1;
        }
        documentService.invalidateLayerSession(docId, layerName);
        return await op();
      }
    } catch (err) {
      documentService.invalidateLayerSession(docId, layerName);
      throw err;
    } finally {
      settle();
      // Attempt-artifact hygiene: any upload whose commit did not win is
      // unreachable garbage (unique per-attempt keys). Best-effort, awaited
      // so a caller observing the response never sees the orphan; crash
      // windows are the orphan sweeper's job.
      await this.cleanupPendingAttempts(ctx, docId, layerName);
    }
  }

  /** Delete every registered attempt key that no commit claimed. */
  private async cleanupPendingAttempts(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
  ): Promise<void> {
    const pending = this.pendingAttemptKeys.get(layerWriteKey(ctx, docId, layerName));
    if (!pending || pending.size === 0) return;
    const keys = [...pending];
    pending.clear();
    await Promise.all(
      keys.map((key) =>
        this.requireStorage()
          .delete(key)
          .catch(() => undefined),
      ),
    );
  }

  private requireDb(): Kysely<Schema> {
    if (!this.db) {
      throw new EngineError(EngineErrorCode.NotImplemented, 'LayerService DB is not configured');
    }
    return this.db;
  }

  private requireDocumentService(): DocumentService {
    if (!this.documentService) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        'LayerService document service is not configured',
      );
    }
    return this.documentService;
  }

  private requireRevisionBridge(): CloudRevisionBridge {
    if (!this.revisionBridge) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        'LayerService revision bridge is not configured',
      );
    }
    return this.revisionBridge;
  }

  private requirePool(): EnginePool {
    if (!this.pool) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        'LayerService worker pool is not configured',
      );
    }
    return this.pool;
  }

  private requireStorage(): ObjectStore {
    if (!this.storage) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        'LayerService storage is not configured',
      );
    }
    return this.storage;
  }
}

function makeAuditEvent(input: {
  ctx: LayerWriteContext;
  docId: string;
  layer: LayerRow;
  layerName: string;
  kind: AuditEvent['kind'];
  pageObjectNumber: number | null;
  affectedPages: number[];
  artifactVersion: number;
  artifactKey: string;
  artifactSha: string;
  artifactSize: number;
  payload: unknown;
  ts: number;
}): AuditEvent {
  return {
    tenantId: input.ctx.tenantId,
    docId: input.docId,
    layerId: input.layer.id,
    layerName: input.layerName,
    ts: input.ts,
    sub: input.ctx.sub,
    kind: input.kind,
    pageObjectNumber: input.pageObjectNumber,
    affectedPages: input.affectedPages,
    artifactVersion: input.artifactVersion,
    artifactKey: input.artifactKey,
    artifactSha: input.artifactSha,
    artifactSize: input.artifactSize,
    idempotencyKey: null,
    payload: input.payload,
    originSessionId: input.ctx.originSessionId ?? null,
  };
}

function requireLayerArtifact(payload: unknown): LayerArtifactInput {
  const source =
    payload && typeof payload === 'object'
      ? (payload as {
          artifact?: { bytes: ArrayBuffer; size: number };
          artifactFile?: { path: string };
        })
      : undefined;
  const artifact = source?.artifact ?? source?.artifactFile;
  if (!artifact) {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      'layer mutation did not return a saved layer artifact',
    );
  }
  return artifact;
}

/**
 * Project a widget change report onto page impacts. Unplaced widgets
 * (`pageObjectNumber === 0`) have no page-visible effect and are skipped.
 */
function widgetImpacts(
  widgets: ReadonlyArray<FormWidgetRef>,
  kind: MutationImpactKind,
): FormPageImpact[] {
  return widgets
    .filter((widget) => widget.pageObjectNumber > 0)
    .map((widget) => ({ pageObjectNumber: widget.pageObjectNumber, kind }));
}

/** Conservative impact for document-wide form ops (import, repair). */
/** One key grammar for everything scoped to a layer's write pipeline. */
function layerWriteKey(ctx: LayerWriteContext, docId: string, layerName: string): string {
  return `${ctx.tenantId}::${docId}::${layerName}`;
}

function allPageImpacts(materialized: MaterializedLayer): FormPageImpact[] {
  return materialized.pages.map((page) => ({
    pageObjectNumber: page.pageObjectNumber,
    kind: 'update' as MutationImpactKind,
  }));
}

/**
 * One impact per page. When several widgets on the same page report
 * different kinds, `delete` wins (it is the only kind that must advance
 * the annotation generation — the /Annots index space shifted).
 */
function dedupeImpacts(impacts: FormPageImpact[]): FormPageImpact[] {
  const byPage = new Map<number, FormPageImpact>();
  for (const impact of impacts) {
    const existing = byPage.get(impact.pageObjectNumber);
    if (!existing || (existing.kind !== 'delete' && impact.kind === 'delete')) {
      byPage.set(impact.pageObjectNumber, impact);
    }
  }
  return Array.from(byPage.values());
}

function requireSingleAffectedPage(pages: readonly PageState[]): PageState {
  if (pages.length !== 1) {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `annotation mutation expected exactly one affected page, got ${pages.length}`,
    );
  }
  return pages[0];
}

function requireKnownWeakAnnotationBoolean(page: PageState): boolean {
  if (page.weakAnnotationState.kind !== 'known') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `annotation mutation returned unknown weak annotation state for page ${page.pageObjectNumber}`,
    );
  }
  return page.weakAnnotationState.hasAnyWeakAnnotations;
}

/**
 * Project the request's JWT identity claims into the wire-shape
 * `AnnotationActor` the worker uses to stamp /T, /M, and /EMBD_Metadata.
 *
 * Returns `undefined` when:
 *   - no JWT identity is attached to the context (tenant tokens, dev
 *     fixtures without identity claims), OR
 *   - the identity has neither `user_id` nor `group_id` nor
 *     `display_name` (nothing meaningful to stamp)
 *
 * The worker treats an absent actor as "stamp /M only, skip EMBD_Metadata".
 */
function actorFromContext(ctx: LayerWriteContext): AnnotationActor | undefined {
  const id: IdentityClaims | undefined = ctx.jwt?.identity;
  if (!id) return undefined;
  const actor: AnnotationActor = {};
  if (id.user_id) actor.userId = id.user_id;
  if (id.group_id) actor.groupId = id.group_id;
  if (id.display_name) actor.displayName = id.display_name;
  // No fields set → nothing for the worker to stamp; signal absence.
  if (!actor.userId && !actor.groupId && !actor.displayName) return undefined;
  return actor;
}
