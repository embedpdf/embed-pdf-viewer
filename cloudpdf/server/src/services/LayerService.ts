import type { PdfMeasure, PageScaleResult } from '@embedpdf/engine-core/runtime';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { profileFor, verifyForCompletion } from '@embedpdf/core-signature';
import {
  EngineError,
  EngineErrorCode,
  toPageRef,
  wirePack,
  type AnnotationActor,
  type AnnotationBundleLimits,
  type AnnotationCreateResult,
  type AnnotationImportPages,
  type AnnotationImportResult,
  type AnnotationDeleteResult,
  type AnnotationDraft,
  type AnnotationFlattenResult,
  type AnnotationMoveResult,
  type AnnotationPatch,
  type WireAnnotationBundle,
  type WireAnnotationResources,
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
  type FormWidget,
  type Identity,
  type MetadataPatch,
  type MetadataUpdateResult,
  type MutationMeta,
  type PageDeleteResult,
  type PageFlattenResult,
  type PageFlattenUsage,
  type PageInsertResult,
  type PdfSize,
  type RedactionApplyResult,
  type RedactionApplyScope,
  type PageListSnapshot,
  type PageMoveResult,
  type PageNameResult,
  type PageObjectNumber,
  type PageRef,
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
  type DocumentVersionRef,
  type SignatureCancelResult,
  type SignatureCompleteResult,
  type SignaturePrepareInput,
  type SignaturePrepared,
  type SignatureSubFilter,
  formWidget,
  type AnnotationSubtype,
} from '@embedpdf/engine-core/runtime';
import {
  SignaturePreparedWireSchema,
  decodePrepared,
  encodePrepared,
} from '@embedpdf/engine-core/wire';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { CloudRevisionBridge } from './CloudRevisionBridge';
import type { DocumentService, OpenContext } from './DocumentService';
import type { AuditEvent, EventLogService } from './EventLogService';
import type { LayerStateService } from './LayerStateService';
import type { MutationImpactKind } from './LayerStateService';
import type { WeakAnnotationSessionService } from './WeakAnnotationSessionService';
import type { EngineCounters } from '../app/engine-counters';
import { AuditLogRepo, type AuditMutationKind } from '../db/repos/audit_log.repo';
import type { DocumentSigningsRepo, SigningRow } from '../db/repos/document_signings.repo';
import type { DocumentsRepo } from '../db/repos/documents.repo';
import type { DurablePageRow, LayerRow } from '../db/repos/page_state.repo';
import type { PdfPasswordSessionsRepo } from '../db/repos/pdf_password_sessions.repo';
import type { Database as Schema } from '../db/schema';
import { isUniqueViolation } from '../db/uniqueViolation';
import type { RealtimeBus } from '../realtime/RealtimeBus';
import type { EnginePool } from '../runtime/EnginePool';
import { signingCandidatePath } from '../runtime/signing-paths';
import type { PasswordSessionBinding } from '../security/password-session';
import type { LocalFileHandle } from '../storage/BaseFileCache';
import { StorageKeys } from '../storage/keys';
import type { ObjectStore } from '../storage/ObjectStore';

type LayerArtifactInput = { bytes: ArrayBuffer; size: number } | { path: string };

/**
 * Page addresses arrive on the wire as `PageRef`s (one kind: the canonical
 * `objectNumber`); everything this service persists — weak-session guards,
 * `layer_pages` rows, audit rows — is keyed by the number. Unwrap once at
 * the entry point; the worker request carries the refs as received.
 */
function pageObjectNumbersOf(pages: readonly PageRef[]): PageObjectNumber[] {
  return pages.map((page) => {
    if (page.kind !== 'objectNumber') {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `unsupported page address kind '${String((page as { kind: unknown }).kind)}'`,
      );
    }
    return page.pageObjectNumber;
  });
}

/**
 * The commit-time version CAS lost: `layers.current_version` moved between
 * this op's prepare (which aligned the worker session to the row it read)
 * and its commit transaction. Under the per-process write queue that can
 * only mean a remote replica committed in the window — the signal for
 * {@link LayerService.runWithRebase} to reload the session from the new
 * durable head and re-apply. A distinct class and a distinct code — never
 * a bare `Aborted` — so neither the rebase path nor a client SDK can
 * confuse a fence loss with a caller-initiated cancellation: it surfaces
 * as HTTP 409 (retryable), not 499.
 */
const DEFAULT_SIGNING_TTL_MS = 15 * 60 * 1000;

/** Thrown inside the publish transaction when the claim finds the signing already completed with this CMS. */
class AlreadyCompleted extends Error {
  constructor(readonly signing: SigningRow) {
    super('already completed');
  }
}

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
  /** The new bulk-annotations pin this mutation committed. */
  annotationsVersion: number;
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

/**
 * Form audit kinds that change annotation list bodies (field/widget
 * structure) and therefore bump the bulk `annotations_version` pin.
 * Value writes, effects, import and repair only re-bake `/AP` rasters —
 * the per-page `annotationVersion` covers those; the bulk pin stays put
 * so hydration caches survive form-filling sessions.
 */
const FORM_STRUCTURE_AUDIT_KINDS: ReadonlySet<string> = new Set([
  'form.createField',
  'form.updateField',
  'form.deleteField',
  'form.attachWidget',
  'form.detachWidget',
]);

/** The durable state a document mutation produced inside its transaction. Mutations
 *  are document-scoped, so 0..N pages may have been touched. */
interface CommittedDocumentMutation {
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
  /** Operational counters read by metrics collect closures. */
  counters?: EngineCounters;
  /** Durable signings (migration 030); the signing verbs need it. */
  signings?: DocumentSigningsRepo;
  /** Password sessions, for rebinding the completer's session to the published version. */
  passwordSessions?: PdfPasswordSessionsRepo;
  /** Where the engine writes signing candidates (the same root the workers boot with). */
  signingRoot?: string;
  /** How long a prepared signing may wait for its CMS. Default 15 minutes. */
  signingTtlMs?: number;
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
  private readonly signings?: DocumentSigningsRepo;
  private readonly passwordSessions?: PdfPasswordSessionsRepo;
  private readonly signingRoot?: string;
  private readonly signingTtlMs: number;
  private readonly layerWriteQueues = new Map<string, Promise<unknown>>();
  /**
   * Attempt artifact keys uploaded by the current write op that no commit
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
    this.signings = opts.signings;
    this.passwordSessions = opts.passwordSessions;
    this.signingRoot = opts.signingRoot;
    this.signingTtlMs = opts.signingTtlMs ?? DEFAULT_SIGNING_TTL_MS;
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

    // Seed the row from the HEAD (law 9c): its docVersion is what the
    // unwritten layer's manifest already advertises (the first write then
    // moves to head + 1, never reusing a pin), and its plane pointers are
    // the head version's, so a layer over a published version compares as
    // inherited against the right epochs.
    const base = doc.baseSha
      ? await this.layerState.baseVersionFacts(docId, doc.baseSha, doc.storageSizeBytes)
      : null;
    const layer = await this.layerState.repos.layers.createEmpty({
      id: `layer_${randomUUID()}`,
      docId,
      tenantId: ctx.tenantId,
      name: layerName,
      baseSha: doc.baseSha,
      docVersion: doc.docVersion,
      ...(base
        ? {
            layoutVersion: base.layoutVersion,
            metadataVersion: base.metadataVersion,
            attachmentsVersion: base.attachmentsVersion,
            annotationsVersion: base.annotationsVersion,
          }
        : {}),
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
      draft: AnnotationDraft;
      /**
       * Optional actor override. When supplied, replaces the actor
       * built from `ctx.jwt.identity`. Routes pass this so that the
       * actor construction (and any future policy on it) lives next to
       * the capability check. The service trusts what arrives here.
       */
      actor?: AnnotationActor;
      /** The bytes beside the draft, by role (multipart `resource:{role}` parts). */
      resources?: WireAnnotationResources;
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
            page: toPageRef(input.pageObjectNumber),
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

  /**
   * `doc.annotations.import` on a layer: one worker job, whose failure
   * leaves the session as it was, then one artifact, one commit across every
   * page it touched and one audit row. A retry under the same
   * `idempotencyKey` gets back what the first request committed.
   */
  async importAnnotations(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      bundle: WireAnnotationBundle;
      pages?: AnnotationImportPages;
      attribution: 'restore' | 'stamp';
      /** The caller's identity, which `'stamp'` attributes each annotation to. */
      actor?: AnnotationActor;
      limits: AnnotationBundleLimits;
      idempotencyKey?: string;
    },
    signal?: AbortSignal,
  ): Promise<AnnotationImportResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      const replay = await this.committedImport(layer.id, input.idempotencyKey);
      if (replay) return replay;
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack(
            {
              kind: 'annotations.import' as const,
              jobId,
              docId: input.docId,
              layerName: input.layerName,
              bundle: input.bundle,
              ...(input.pages !== undefined ? { pages: input.pages } : {}),
              attribution: input.attribution,
              ...(input.actor ? { actor: input.actor } : {}),
              limits: input.limits,
              artifactPath,
            },
            Object.values(input.bundle.resources),
          );
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'annotations.import') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected annotations.import payload: ${payload.tag}`,
          );
        }
        // Everything was left out: nothing was written, nothing to commit.
        if (payload.result.annotations.length === 0) return payload.result;
        try {
          return await this.persistAnnotationImport(ctx, input.docId, input.layerName, layer, {
            result: payload.result,
            artifact: requireLayerArtifact(payload as unknown),
            ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
          });
        } catch (err) {
          // Another replica committed the same key first: that is the result.
          const committed = isUniqueViolation(err)
            ? await this.committedImport(layer.id, input.idempotencyKey)
            : null;
          if (committed) return committed;
          throw err;
        }
      });
    });
  }

  /** The result an import committed under `idempotencyKey`, if one did. */
  private async committedImport(
    layerId: string,
    idempotencyKey: string | undefined,
  ): Promise<AnnotationImportResult | null> {
    if (!idempotencyKey) return null;
    const row = await new AuditLogRepo(this.requireDb()).findByIdempotencyKey(
      layerId,
      idempotencyKey,
    );
    if (!row) return null;
    if (row.kind !== 'annot.import') {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `idempotency key ${idempotencyKey} was used for another change (${row.kind})`,
      );
    }
    return row.payload as AnnotationImportResult;
  }

  async updateAnnotation(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      ref: AnnotationRef;
      patch: AnnotationPatch;
      /** The bytes beside the patch, by role (multipart `resource:{role}` parts). */
      resources?: WireAnnotationResources;
      /**
       * Optional actor override. For UPDATE this is typically built
       * from the caller's JWT identity (for /UpdatedBy) plus any
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
   * call this before the mutation so `requireLayerCollabAction` can
   * deny with 403 without ever issuing a write.
   *
   * V1 implementation: page-fetch + filter. Uses the raw
   * `annotations.list` worker job (docPtr dictionary walk — no
   * FPDF_LoadPage; wire-identical DTOs, and this runs on every
   * PATCH/DELETE, so it is the mutation hot path) and finds the row
   * matching the ref. Returns an empty `{}` if the annotation can't be
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
  ): Promise<{ userId?: string; groupId?: string; subtype?: AnnotationSubtype }> {
    // The worker job below assumes the layer is already attached to the
    // pool's session for `docId`. Most read paths already do this via
    // `documentService.ensureLayerOnPool`; collab gating runs before any
    // mutation, so we have to open it ourselves.
    await this.requireDocumentService().ensureLayerOnPool(ctx, docId, layerName);

    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'annotations.list' as const,
        jobId,
        docId,
        layerName,
        pages: [toPageRef(pageObjectNumber)],
      });
    const payload = await this.requirePool().run(docId, build, signal);
    if (payload.tag !== 'annotations.list') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected annotations.list payload while resolving collab target: ${payload.tag}`,
      );
    }
    const annotations = payload.list.annotations;
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
      ...(match.userId != null ? { userId: match.userId } : {}),
      ...(match.groupId != null ? { groupId: match.groupId } : {}),
      subtype: match.subtype,
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
        pageObjectNumber: input.ref.page.pageObjectNumber,
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
            page: toPageRef(input.pageObjectNumber),
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
      pages: PageRef[];
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
            pages: input.pages,
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

  /**
   * Register/rename a `/Names /Pages` entry. Named pages are layout, so this
   * persists exactly like a page move: a new layer artifact, doc_version +
   * layout_version advance, `layer_pages` rows untouched.
   */
  async setPageScale(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      pageObjectNumber: number;
      measure: PdfMeasure | null;
    },
    signal?: AbortSignal,
  ): Promise<PageScaleResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.requirePool().run(
          input.docId,
          (jobId: WorkerJobId) =>
            wirePack({
              kind: 'measure.setScale' as const,
              jobId,
              docId: input.docId,
              layerName: input.layerName,
              page: toPageRef(input.pageObjectNumber),
              measure: input.measure,
              artifactPath,
            }),
          signal,
        );
        if (payload.tag !== 'measure.setScale')
          throw new EngineError(EngineErrorCode.WireFormat, 'Unexpected scale response');
        // The artifact/docVersion advances. Calibration changes no pixels or annotation indices.
        return this.persistDocumentMutation(ctx, input.docId, input.layerName, layer, {
          auditKind: 'measure.setScale',
          impacts: [],
          result: payload.result,
          artifact: requireLayerArtifact(payload),
        });
      });
    });
  }

  async setPageName(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      name: string;
      page: PageRef;
      replace?: string;
    },
    signal?: AbortSignal,
  ): Promise<PageNameResult> {
    return this.runPageNameMutation(
      ctx,
      input.docId,
      input.layerName,
      (jobId, artifactPath) =>
        wirePack({
          kind: 'pages.setName' as const,
          jobId,
          docId: input.docId,
          layerName: input.layerName,
          name: input.name,
          page: input.page,
          ...(input.replace !== undefined ? { replace: input.replace } : {}),
          artifactPath,
        }),
      'pages.setName',
      signal,
    );
  }

  /** Remove a `/Names /Pages` entry (the page stays). Persists like a move. */
  async removePageName(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; name: string },
    signal?: AbortSignal,
  ): Promise<PageNameResult> {
    return this.runPageNameMutation(
      ctx,
      input.docId,
      input.layerName,
      (jobId, artifactPath) =>
        wirePack({
          kind: 'pages.removeName' as const,
          jobId,
          docId: input.docId,
          layerName: input.layerName,
          name: input.name,
          artifactPath,
        }),
      'pages.removeName',
      signal,
    );
  }

  private async runPageNameMutation(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    build: (jobId: WorkerJobId, artifactPath: string) => WirePack<WorkerRequest>,
    tag: 'pages.setName' | 'pages.removeName',
    signal?: AbortSignal,
  ): Promise<PageNameResult> {
    return this.enqueueLayerWrite(ctx, docId, layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, docId, layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.requirePool().run(
          docId,
          (jobId) => build(jobId, artifactPath),
          signal,
        );
        if (payload.tag !== tag) {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected ${tag} payload: ${payload.tag}`,
          );
        }
        // Layout-shaped result — the page-move persistence path is exact.
        return this.persistPageMove(ctx, docId, layerName, layer, {
          result: payload.result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  /**
   * `pages.flatten` for a chosen set of one page's annotations. Same weak-
   * editor guard and the same persistence as a page flatten (content +
   * annotation versions of that page advance, a new layer artifact).
   */
  async flattenAnnotations(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      pageObjectNumber: PageObjectNumber;
      refs: AnnotationRef[];
      usage: PageFlattenUsage;
    },
    signal?: AbortSignal,
  ): Promise<AnnotationFlattenResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      await this.assertWeakAnnotationStructuralEditAllowed(ctx, {
        docId: input.docId,
        layerName: input.layerName,
        layer,
        pageObjectNumber: input.pageObjectNumber,
      });
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.requirePool().run(
          input.docId,
          (jobId) =>
            wirePack({
              kind: 'annotations.flatten' as const,
              jobId,
              docId: input.docId,
              layerName: input.layerName,
              page: toPageRef(input.pageObjectNumber),
              refs: input.refs,
              usage: input.usage,
              artifactPath,
            }),
          signal,
        );
        if (payload.tag !== 'annotations.flatten') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected annotations.flatten payload: ${payload.tag}`,
          );
        }
        if (payload.result.meta === null) return payload.result;
        return this.persistPageFlatten(ctx, input.docId, input.layerName, layer, {
          result: payload.result as AnnotationFlattenResult & { meta: MutationMeta },
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
      pages: PageRef[];
      rotation: PageRotation;
    },
    signal?: AbortSignal,
  ): Promise<PageRotateResult> {
    const pageObjectNumbers = pageObjectNumbersOf(input.pages);
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
            pages: input.pages,
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
          affectedPages: pageObjectNumbers,
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
      pages: PageRef[];
    },
    signal?: AbortSignal,
  ): Promise<PageDeleteResult> {
    const pageObjectNumbers = pageObjectNumbersOf(input.pages);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      // Destroying a page someone is mid-edit on is the collaboration
      // conflict the weak-session model exists for: for every target page
      // with weak annotations the caller must be the sole active editor.
      for (const pageObjectNumber of pageObjectNumbers) {
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
            pages: input.pages,
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
          deletedPages: pageObjectNumbers,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  async insertPages(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      /** The standalone source PDF whose pages are copied in. Never put on
       *  a postMessage transfer list — the fence-conflict rebase re-runs
       *  this op, and a transferred (detached) buffer would corrupt the
       *  retry. Structured clone copies it, like annotation resources. */
      bytes: ArrayBuffer;
      destIndex?: number;
    },
    signal?: AbortSignal,
  ): Promise<PageInsertResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      // No weak-session guard: like move, an insert only shifts display
      // indices — it never touches an existing page's /Annots or identity.
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'pages.insert' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            bytes: input.bytes,
            ...(input.destIndex !== undefined ? { destIndex: input.destIndex } : {}),
            artifactPath,
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'pages.insert') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected pages.insert payload: ${payload.tag}`,
          );
        }
        return this.persistPageInsert(ctx, input.docId, input.layerName, layer, {
          kind: 'pages.insert',
          result: payload.result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  async insertBlankPages(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      size: PdfSize;
      count?: number;
      destIndex?: number;
    },
    signal?: AbortSignal,
  ): Promise<PageInsertResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'pages.insertBlank' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            size: input.size,
            ...(input.count !== undefined ? { count: input.count } : {}),
            ...(input.destIndex !== undefined ? { destIndex: input.destIndex } : {}),
            artifactPath,
          });
        const payload = await this.requirePool().run(input.docId, build, signal);
        if (payload.tag !== 'pages.insertBlank') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected pages.insertBlank payload: ${payload.tag}`,
          );
        }
        return this.persistPageInsert(ctx, input.docId, input.layerName, layer, {
          kind: 'pages.insertBlank',
          result: payload.result,
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
      pages: PageRef[];
      usage: PageFlattenUsage;
    },
    signal?: AbortSignal,
  ): Promise<PageFlattenResult> {
    const pageObjectNumbers = pageObjectNumbersOf(input.pages);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      // Eligible annotations are removed from /Annots. Protect weak index
      // editors before the worker can shift any target page's index space.
      for (const pageObjectNumber of pageObjectNumbers) {
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
              pages: input.pages,
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
          ? pageObjectNumbersOf(input.scope.pages)
          : [...new Set(input.scope.refs.map((ref) => ref.page.pageObjectNumber))];
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
  // Identity is the name-tree key (unique by construction) — no weak
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
  // `meta` is empty (the session has no durable page state); the commit
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
        impacts: (result: FormSetValueResult) =>
          widgetImpacts(result.meta.changedWidgets, 'update'),
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
        impacts: (result: FormSetValueResult) =>
          widgetImpacts(result.meta.changedWidgets, 'update'),
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
        if (!payload.wrote) return result;

        const impacts = widgetImpacts(result.meta.changedWidgets, 'update');
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

        return this.persistDocumentMutation(ctx, input.docId, input.layerName, layer, {
          auditKind: 'form.applyEffects',
          impacts: conservativeImpacts,
          result,
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

  /** The visual fill of an unsigned signature field: a PDF page drawn into its widgets, nothing sealed. */
  async setSignatureAppearance(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      ref: FormFieldRef;
      pdf: Uint8Array;
      pageIndex: number;
    },
    signal?: AbortSignal,
  ): Promise<FormFieldUpdateResult> {
    const pdf = new ArrayBuffer(input.pdf.byteLength);
    new Uint8Array(pdf).set(input.pdf);
    return this.runFormMutation(
      ctx,
      {
        docId: input.docId,
        layerName: input.layerName,
        tag: 'forms.setSignatureAppearance',
        auditKind: 'form.setSignatureAppearance',
        build: (jobId, artifactPath) =>
          wirePack(
            {
              kind: 'forms.setSignatureAppearance' as const,
              jobId,
              docId: input.docId,
              layerName: input.layerName,
              ref: input.ref,
              pdf,
              pageIndex: input.pageIndex,
              artifactPath,
            },
            [pdf],
          ),
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
        impacts: (result: FormFieldDeleteResult) =>
          widgetImpacts(result.meta.changedWidgets, 'delete'),
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
      widget: AnnotationRef;
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
        impacts: () => widgetImpacts([widgetOfRef(input.widget)], 'update'),
      },
      signal,
    );
  }

  async detachFormWidget(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; ref: FormFieldRef; widget: AnnotationRef },
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
        impacts: () => widgetImpacts([widgetOfRef(input.widget)], 'update'),
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
        return this.persistDocumentMutation(ctx, input.docId, input.layerName, layer, {
          auditKind: input.auditKind,
          impacts: input.impacts(result, materialized),
          result,
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  private async persistDocumentMutation<TResult extends { meta: MutationMeta }>(
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
    const committed = await this.commitDocumentMutation({
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
        this.finalizeDocumentMutationResult(docId, layerName, input.result, durable),
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    // The response is the audited payload — one fact for caller and history.
    return committed.payload as TResult;
  }

  /**
   * Turn the worker's session-relative result (whose `meta` is empty by
   * construction) into the finalized wire result: decorated per-page states
   * and the real cacheDelta from the committed version bumps.
   */
  private finalizeDocumentMutationResult<TResult extends { meta: MutationMeta }>(
    docId: string,
    layerName: string,
    raw: TResult,
    durable: CommittedDocumentMutation,
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
   * Document mutation commit: advance the layer's `doc_version` (a new artifact always
   * exists) and bump the affected pages' annotation counters per their
   * impact kind. Non-rendering mutations (field rename, unplaced create, page calibration)
   * legitimately touch zero pages — the layer still advances so the new
   * artifact becomes current.
   */
  private async commitDocumentMutation(input: {
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
    finalizePayload: (durable: CommittedDocumentMutation) => unknown;
  }): Promise<{ durable: CommittedDocumentMutation; payload: unknown; auditId: number }> {
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

        const durable: CommittedDocumentMutation = {
          pages: nextPages,
          previousLayerDocVersion,
          layerDocVersion,
        };
        // Finalize before the audit append so the row stores exactly what
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

        await this.writeLayerAdvance(
          trx,
          input,
          {
            doc_version: layerDocVersion,
            // Structural form ops change the widget population / DTOs;
            // clients re-pin the bulk leaf via the 404-refresh rail (the
            // form cacheDelta does not carry the pin).
            ...(FORM_STRUCTURE_AUDIT_KINDS.has(input.kind)
              ? { annotations_version: Number(currentLayer.annotations_version ?? 1) + 1 }
              : {}),
          },
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
    // A pending signing blocks layer writes. This check is the courtesy;
    // the guarantee is that `prepare` is a fenced layer write (its
    // version bump makes a racing edit lose its own CAS and land here on
    // its rebase, where the row is now visible).
    const pending = await this.signings?.findPending(materialized.layer.id);
    if (pending && pending.expiresAt > Date.now()) {
      throw new EngineError(
        EngineErrorCode.SigningPending,
        `a signing is pending (${pending.id}); complete or cancel it before mutating the layer`,
      );
    }
    // The fence alignment: the worker session must embody exactly the layer
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
      pageObjectNumber: requireSingleAffectedPage(input.result.meta.affectedPages).page
        .pageObjectNumber,
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
    // The response is the audited payload — one fact for caller and history.
    return committed.payload as TResult;
  }

  /**
   * Turn the worker's session-relative result into the finalized wire result:
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
      annotationsVersion: durable.annotationsVersion,
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
      affectedPages: input.result.layout.pages.map((page) => page.ref.pageObjectNumber),
      artifactKey,
      artifactSha: uploaded.sha256,
      artifactSize: uploaded.size,
      nextVersion,
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    return committed.result;
  }

  /**
   * Rotate shares the move commit exactly (the corrected model: rotation is
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

  private async persistPageFlatten<T extends { meta: MutationMeta }>(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      result: T;
      artifact: LayerArtifactInput;
    },
  ): Promise<T> {
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

  private async persistAnnotationImport(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      result: AnnotationImportResult;
      artifact: LayerArtifactInput;
      idempotencyKey?: string;
    },
  ): Promise<AnnotationImportResult> {
    const nextVersion = layer.currentVersion + 1;
    const artifactKey = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
    const uploaded = await this.uploadLayerArtifact(artifactKey, input.artifact);
    const committed = await this.commitAnnotationImport({
      ctx,
      docId,
      layerName,
      layer,
      raw: input.result,
      artifactKey,
      artifactSha: uploaded.sha256,
      artifactSize: uploaded.size,
      nextVersion,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    // The response is the audited payload — one fact for caller and history.
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

  private async persistPageInsert(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      kind: 'pages.insert' | 'pages.insertBlank';
      result: PageInsertResult;
      artifact: LayerArtifactInput;
    },
  ): Promise<PageInsertResult> {
    const nextVersion = layer.currentVersion + 1;
    const artifactKey = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
    const uploaded = await this.uploadLayerArtifact(artifactKey, input.artifact);
    const committed = await this.commitPageInsert({
      ctx,
      docId,
      layerName,
      layer,
      kind: input.kind,
      layout: input.result.layout,
      insertedPages: input.result.insertedPages.map((page) => page.pageObjectNumber),
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

    const page = await this.requireLayerPage(layer.id, ref.page.pageObjectNumber);
    const durablePageState = this.layerState.decorateLayerPageState(docId, layerName, page);
    // Refs minted by shared base reads carry the base revision scope;
    // the generation check still gates staleness (see the bridge's doc).
    this.requireRevisionBridge().validateClientIndexRef(durablePageState, ref, {
      aliasDocSessionIds: [this.layerState.baseRevisionScopeId(docId)],
    });
    const workerPageState = await this.loadWorkerPageState(
      docId,
      layerName,
      ref.page.pageObjectNumber,
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
    // Raw read: only `pageState` is consumed here — the cheapest possible
    // way to learn the worker's revision state for this page.
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'annotations.list' as const,
        jobId,
        docId,
        layerName,
        pages: [toPageRef(pageObjectNumber)],
      });
    const payload = await this.requirePool().run(docId, build, signal);
    const pageState = payload.tag === 'annotations.list' ? payload.list.pages[0] : undefined;
    if (!pageState) {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected annotations.list payload while rewriting index ref: ${payload.tag}`,
      );
    }
    return pageState;
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
     * Builds the finalized result (cloud-stable revision tokens, real
     * cacheDelta) from the in-transaction durable state. Its return is what
     * the audit row stores and what the caller receives — the invariant is
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
        // Plain read — values feed the next-version computation. The fence
        // is not here: it is the guarded UPDATE below, the only check that
        // is atomic with the write (a SELECT takes no lock; two overlapping
        // transactions can both pass a read-then-check).
        const currentLayer = await trx
          .selectFrom('layers')
          .select(['current_version', 'doc_version', 'annotations_version'])
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
        // Every annotation CRUD kind changes list bodies, so the bulk pin
        // advances in lockstep with the per-page annotationVersion.
        const annotationsVersion =
          Number(currentLayer.annotations_version ?? 1) + (bumps.bumpAnnotationVersion ? 1 : 0);

        const durable: CommittedAnnotationMutation = {
          page: nextPage,
          weakRefsInvalidated: bumps.weakRefsInvalidated,
          previousLayerDocVersion,
          layerDocVersion,
          annotationsVersion,
        };
        // Finalize before the audit append so the row stores exactly what the
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
          annotations_version: annotationsVersion,
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
   * Shared commit for the page-structure ops that keep the page set intact
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

        // The worker's layout is the new order; validate its page set against
        // the durable rows before trusting it.
        const pageOrder = input.layout.pages.map((page) => page.ref.pageObjectNumber);
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

        // The finalized result — audited and returned identically: what we
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
   * Delete commit: the only page-structure op that mutates the page set. On
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
        const survivorOrder = input.layout.pages.map((page) => page.ref.pageObjectNumber);
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

        // Weak-annotation sessions of this layer lose their claims on the
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

        // The finalized result — audited and returned identically: what we
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
          {
            doc_version: versions.docVersion,
            layout_version: versions.layoutVersion,
            // The page set shrank — the bulk annotation corpus changed.
            // Clients re-pin via the 404-refresh rail (PageStructureCache
            // carries no annotationsVersion).
            annotations_version: Number(currentLayer.annotations_version ?? 1) + 1,
          },
          auditId,
          now,
        );

        return { result, auditId };
      });
  }

  /**
   * Insert commit: the other page-structure op that mutates the page set —
   * the mirror of {@link commitPageDelete}. On top of the shared version
   * bumps it adds `layer_pages` rows for the fresh page object numbers at the initial
   * epoch (`content_version` 1, `annotation_version` 1, generation 0, no
   * weak annotations — exactly what the base snapshot would have written
   * had the pages always existed). Pre-existing rows are untouched, so
   * their pins and revisions stay warm.
   */
  private async commitPageInsert(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    kind: 'pages.insert' | 'pages.insertBlank';
    /** The worker's post-insert layout — becomes `result.layout`. */
    layout: PageListSnapshot;
    insertedPages: PageObjectNumber[];
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
  }): Promise<{
    result: PageInsertResult;
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
        const inserted = new Set(input.insertedPages);
        const pageOrder = input.layout.pages.map((page) => page.ref.pageObjectNumber);
        if (inserted.size !== input.insertedPages.length) {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `${input.kind} returned duplicate inserted page object numbers`,
          );
        }
        if (rows.length + input.insertedPages.length !== pageOrder.length) {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `${input.kind} returned ${pageOrder.length} pages for ${rows.length} layer page rows plus ${input.insertedPages.length} inserted`,
          );
        }
        for (const pageObjectNumber of input.insertedPages) {
          if (known.has(pageObjectNumber)) {
            throw new EngineError(
              EngineErrorCode.WireFormat,
              `${input.kind} claims fresh page object number ${pageObjectNumber} but a row already exists`,
            );
          }
        }
        for (const pageObjectNumber of pageOrder) {
          if (!known.has(pageObjectNumber) && !inserted.has(pageObjectNumber)) {
            throw new EngineError(
              EngineErrorCode.WireFormat,
              `${input.kind} returned unknown page object number ${pageObjectNumber}`,
            );
          }
        }

        await trx
          .insertInto('layer_pages')
          .values(
            input.insertedPages.map((pageObjectNumber) => ({
              layer_id: input.layer.id,
              page_object_number: pageObjectNumber,
              content_version: 1,
              annotation_version: 1,
              annotation_generation: 0,
              has_weak_annotations: 0,
              updated_at: now,
            })),
          )
          .execute();

        const previousDocVersion = Number(currentLayer.doc_version);
        const versions: PageStructureCache = {
          previousDocVersion,
          docVersion: previousDocVersion + 1,
          layoutVersion: Number(currentLayer.layout_version) + 1,
        };

        // The finalized result — audited and returned identically: what we
        // tell the caller is what we tell history (and remote subscribers).
        const result: PageInsertResult = {
          insertedPages: input.insertedPages.map(toPageRef),
          layout: input.layout,
          cache: versions,
        };

        const auditEvent = makeAuditEvent({
          ctx: input.ctx,
          docId: input.docId,
          layer: input.layer,
          layerName: input.layerName,
          kind: input.kind,
          pageObjectNumber: null,
          affectedPages: input.insertedPages,
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
          {
            doc_version: versions.docVersion,
            layout_version: versions.layoutVersion,
            // The page set grew — the bulk annotation corpus changed.
            // Clients re-pin via the 404-refresh rail (PageStructureCache
            // carries no annotationsVersion).
            annotations_version: Number(currentLayer.annotations_version ?? 1) + 1,
          },
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
  private async commitPageFlatten<T extends { meta: MutationMeta }>(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    raw: T;
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
  }): Promise<{ result: T; auditId: number }> {
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const currentLayer = await this.readLayerForCommit(trx, input.layer);
        const weakStateByPage = new Map(
          input.raw.meta.affectedPages.map((page) => [
            page.page.pageObjectNumber,
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
        // Flatten bakes annotations into content — list bodies change.
        const annotationsVersion = Number(currentLayer.annotations_version ?? 1) + 1;
        const durable: CommittedPageFlatten = {
          pages: nextPages,
          previousLayerDocVersion,
          layerDocVersion: previousLayerDocVersion + 1,
        };
        const result: T = {
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
              annotationsVersion,
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
          { doc_version: durable.layerDocVersion, annotations_version: annotationsVersion },
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

  /**
   * An import's commit: every page it touched advances as a create does
   * (appended annotations shift no index), the layer's `doc_version` and bulk
   * annotations pin once, and one audit row holds the finalized result
   * under the request's idempotency key.
   */
  private async commitAnnotationImport(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    raw: AnnotationImportResult;
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
    idempotencyKey: string | null;
  }): Promise<{ result: AnnotationImportResult; auditId: number }> {
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const currentLayer = await this.readLayerForCommit(trx, input.layer);
        const affected = input.raw.meta.affectedPages.map((state) => state.page.pageObjectNumber);

        let bumpLayerDocVersion = false;
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
              `annotations.import reported unknown page object number ${pageObjectNumber}`,
            );
          }
          const hasWeakAnnotations = Boolean(row.has_weak_annotations);
          const bumps = this.layerState.mutationBumps('create', { hasWeakAnnotations });
          bumpLayerDocVersion ||= bumps.bumpLayerDocVersion;
          nextPages.push({
            pageObjectNumber,
            contentVersion: Number(row.content_version) + (bumps.bumpContentVersion ? 1 : 0),
            annotationVersion:
              Number(row.annotation_version) + (bumps.bumpAnnotationVersion ? 1 : 0),
            annotationGeneration:
              Number(row.annotation_generation) + (bumps.bumpAnnotationGeneration ? 1 : 0),
            // New annotations are indirect objects: no page gains a weak one.
            hasWeakAnnotations,
            updatedAt: now,
          });
        }

        const previousLayerDocVersion = Number(currentLayer.doc_version);
        const layerDocVersion = previousLayerDocVersion + (bumpLayerDocVersion ? 1 : 0);
        const annotationsVersion = Number(currentLayer.annotations_version ?? 1) + 1;
        // The created annotations are addressed by object number, which no
        // revision token decorates; only the page states are the layer's.
        const result: AnnotationImportResult = {
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
              annotationsVersion,
              pages: nextPages,
            }),
          },
        };

        const auditEvent = makeAuditEvent({
          ctx: input.ctx,
          docId: input.docId,
          layer: input.layer,
          layerName: input.layerName,
          kind: 'annot.import',
          pageObjectNumber: null,
          affectedPages: affected,
          artifactVersion: input.nextVersion,
          artifactKey: input.artifactKey,
          artifactSha: input.artifactSha,
          artifactSize: input.artifactSize,
          idempotencyKey: input.idempotencyKey,
          payload: result,
          ts: now,
        });
        const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;

        await this.writeLayerAdvance(
          trx,
          input,
          { doc_version: layerDocVersion, annotations_version: annotationsVersion },
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
            page.page.pageObjectNumber,
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
        // Redaction consumes the marks and rewrites annotations — list
        // bodies change.
        const annotationsVersion = Number(currentLayer.annotations_version ?? 1) + 1;
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
              annotationsVersion,
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

        await this.writeLayerAdvance(
          trx,
          input,
          { doc_version: layerDocVersion, annotations_version: annotationsVersion },
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

  /** Re-read the layer inside the commit transaction and reject if another
   *  write advanced it since `prepareLayerMutation` (the optimistic check
   *  every structure commit shares). */
  private async readLayerForCommit(
    trx: Transaction<Schema>,
    layer: LayerRow,
  ): Promise<{
    doc_version: number | bigint;
    layout_version: number | bigint;
    annotations_version: number | bigint;
  }> {
    // Plain read — values feed the next-version computation. The fence is
    // the guarded UPDATE (see guardedVersionBump), never a SELECT check.
    const currentLayer = await trx
      .selectFrom('layers')
      .select(['current_version', 'doc_version', 'layout_version', 'annotations_version'])
      .where('id', '=', layer.id)
      .executeTakeFirst();
    if (!currentLayer) {
      throw new EngineError(EngineErrorCode.NotFound, `layer not found: ${layer.id}`);
    }
    return currentLayer;
  }

  /**
   * The commit-time fence: advance the layer row if and only if
   * `current_version` is still exactly what this operation prepared
   * against — one conditional UPDATE, atomic on every engine.
   *
   * Why this is the only sound shape: a SELECT-then-check takes no lock,
   * so on Postgres (read committed) two overlapping transactions can both
   * pass the check at version N; the second UPDATE then blocks on the
   * first's row lock and — with only `id` in the predicate — re-evaluates
   * against the new row and applies anyway, silently overwriting the
   * winner's artifact pointer. Putting the expected version in the UPDATE
   * predicate makes that re-evaluation itself the fence: the loser matches
   * zero rows and surfaces a {@link LayerFenceConflict} (→ rebase).
   *
   * `current_version` is the layer's write-serial — every commit path
   * advances it through this method — so a successful guarded bump also
   * certifies every earlier read in this transaction: had any competing
   * commit landed since those reads, the predicate could not have matched.
   */
  // ---------------------------------------------------------------------------
  // Digital signatures: the three verbs of a durable two-phase signing.
  // ---------------------------------------------------------------------------

  /**
   * Prepare: the worker authors and seals a candidate on disk; only the
   * bytes past the immutable base (the tail) leave this machine, so any
   * replica can complete. Prepare is a layer write — its fenced version
   * bump is what makes "a pending signing blocks writes" a guarantee
   * across replicas — but the artifact is untouched: the manifest's
   * `layerVersion` and `working` change, so `docVersion` advances (law 9b).
   */
  async prepareSignature(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; input: SignaturePrepareInput },
    signal?: AbortSignal,
  ): Promise<SignaturePrepared> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      const documentService = this.requireDocumentService();
      const head = await documentService.getHead(ctx, input.docId);
      if (layer.baseSha !== null && layer.baseSha !== head.baseSha) {
        throw new EngineError(
          EngineErrorCode.StaleBase,
          'this layer is behind the document head; rebase it before signing',
        );
      }
      const headVersion = await this.layerState.baseVersionFacts(
        input.docId,
        head.baseSha,
        head.storageSizeBytes,
      );
      const fieldObjectNumber = await this.resolveSignatureField(
        input.docId,
        input.layerName,
        input.input.field,
        signal,
      );

      const payload = await this.requirePool().run(
        input.docId,
        (jobId: WorkerJobId) =>
          wirePack({
            kind: 'signatures.prepare' as const,
            jobId,
            docId: input.docId,
            layerName: input.layerName,
            input: input.input,
          }),
        signal,
      );
      if (payload.tag !== 'signatures.prepare') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload: ${payload.tag}`);
      }
      const prepared = payload.result;
      try {
        const tail = await this.uploadSigningTail(
          ctx,
          input.docId,
          prepared.signingId,
          headVersion.byteLength,
        );
        const now = Date.now();
        const expiresAt = now + this.signingTtlMs;
        const nextVersion = layer.currentVersion + 1;
        const expectedVersion: DocumentVersionRef = {
          baseSha256: head.baseSha,
          editsVersion: nextVersion,
        };
        const answer: SignaturePrepared = {
          ...prepared,
          expectedVersion,
          expiresAt: new Date(expiresAt).toISOString(),
        };
        try {
          await this.requireDb()
            .transaction()
            .execute(async (trx) => {
              await this.guardedVersionBump(trx, layer, {
                current_version: nextVersion,
                doc_version: layer.docVersion + 1,
                updated_at: now,
              });
              await this.requireSignings().insertPrepared(trx, {
                id: prepared.signingId,
                tenantId: ctx.tenantId,
                docId: input.docId,
                layerId: layer.id,
                layerName: input.layerName,
                expectedBaseSha: head.baseSha,
                expectedLayerVersion: nextVersion,
                baseByteLength: headVersion.byteLength,
                tailKey: tail.key,
                tailSha: tail.sha256,
                tailSize: tail.size,
                fieldObjectNumber,
                preparedJson: JSON.stringify(encodePrepared(answer)),
                createdBy: ctx.sub,
                createdAt: now,
                expiresAt,
              });
            });
        } catch (err) {
          await this.requireStorage()
            .delete(tail.key)
            .catch(() => undefined);
          if (isUniqueViolation(err)) {
            throw new EngineError(
              EngineErrorCode.SigningPending,
              'a signing is already pending on this layer; complete or cancel it first',
            );
          }
          throw err;
        }
        this.requireDocumentService().advanceLayerSession(
          input.docId,
          input.layerName,
          nextVersion,
        );
        return answer;
      } finally {
        // The worker's parked copy is redundant now (its tail is durable),
        // or useless after a failure: release it and its file.
        await this.requirePool()
          .run(input.docId, (jobId: WorkerJobId) =>
            wirePack({
              kind: 'signatures.cancel' as const,
              jobId,
              docId: input.docId,
              layerName: input.layerName,
              signingId: prepared.signingId,
            }),
          )
          .catch(() => undefined);
      }
    });
  }

  /**
   * Complete: rebuild the candidate from its durable parts on this
   * replica, install the CMS session-less, and publish the sealed bytes as
   * the document's next base version under two fences (the head and the
   * layer version the candidate was prepared on). Idempotent by signing
   * id: the same CMS again returns the stored result.
   */
  async completeSignature(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      signingId: string;
      cms: Uint8Array;
      expectedVersion: DocumentVersionRef;
    },
    signal?: AbortSignal,
  ): Promise<SignatureCompleteResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const signings = this.requireSignings();
      const signing = await signings.find(input.signingId);
      if (
        !signing ||
        signing.docId !== input.docId ||
        signing.layerName !== input.layerName ||
        signing.tenantId !== ctx.tenantId
      ) {
        throw new EngineError(EngineErrorCode.NotFound, `no signing '${input.signingId}'`);
      }
      // Fast-path answers from a plain read; every one of them is
      // re-established by the guarded claim inside the publish transaction.
      if (signing.state === 'completed') return this.replayCompletion(signing, input.cms);
      if (signing.state !== 'prepared' || signing.expiresAt <= Date.now()) {
        throw new EngineError(
          EngineErrorCode.SigningExpired,
          `signing '${signing.id}' is ${signing.state === 'prepared' ? 'expired' : signing.state}`,
        );
      }
      if (
        input.expectedVersion.baseSha256 !== signing.expectedBaseSha ||
        input.expectedVersion.editsVersion !== signing.expectedLayerVersion
      ) {
        throw new EngineError(
          EngineErrorCode.SigningVersionMismatch,
          'expectedVersion is not the version the candidate was prepared on',
        );
      }
      const prepared = decodePrepared(
        SignaturePreparedWireSchema.parse(JSON.parse(signing.preparedJson)),
      );
      const layer = await this.layerState.repos.layers.findByDocAndName(
        input.docId,
        input.layerName,
      );
      if (!layer || layer.id !== signing.layerId) {
        throw new EngineError(EngineErrorCode.NotFound, `layer '${input.layerName}' is gone`);
      }
      const documentService = this.requireDocumentService();

      // 0. Cryptography before any byte is touched: the CMS must fit,
      //    digest with the prepared algorithm, carry the prepared digest,
      //    verify with its own certificate, and match the profile. Trust
      //    is not judged here.
      const gate = await verifyForCompletion({
        cms: input.cms,
        prepared,
        profile: profileFor(prepared.subFilter as SignatureSubFilter),
      });
      if (!gate.ok) {
        throw new EngineError(EngineErrorCode.SignatureRefused, `${gate.reason}: ${gate.detail}`);
      }

      const baseFile = await documentService.acquireBaseFileFor(
        ctx,
        input.docId,
        signing.expectedBaseSha,
      );
      try {
        return await this.withTempWorkerFile(
          'signing-complete',
          'candidate.pdf',
          async (candidatePath) => {
            // 1. The candidate again, as a private file for this attempt: the
            //    verified base plus the verified tail.
            await this.materializeCandidate(baseFile, signing, candidatePath);

            // 2. Seal and prove in the engine, session-less.
            const cmsBytes = input.cms.slice().buffer as ArrayBuffer;
            const finalizedPayload = await this.requirePool().runAdHoc(
              undefined,
              (jobId: WorkerJobId) =>
                wirePack(
                  {
                    kind: 'signatures.finalizeCandidate' as const,
                    jobId,
                    path: candidatePath,
                    byteRange: prepared.byteRange,
                    contentsSize: prepared.contentsSize,
                    fieldObjectNumber: signing.fieldObjectNumber,
                    cms: cmsBytes,
                    password: null as string | null,
                  },
                  [cmsBytes],
                ),
              signal,
            );
            if (finalizedPayload.tag !== 'signatures.finalizeCandidate') {
              throw new EngineError(
                EngineErrorCode.WireFormat,
                `unexpected payload: ${finalizedPayload.tag}`,
              );
            }
            const finalized = finalizedPayload;

            // 3. The new immutable version, uploaded before the fences: the key
            //    is the content, so a losing attempt leaves only a harmless object.
            const versionKey = StorageKeys.baseVersionPdf(
              ctx.tenantId,
              input.docId,
              finalized.version.sha256,
            );
            await this.uploadVersionObject(versionKey, candidatePath, finalized.version);

            // 4. Publish: one transaction, two fences, one audit row.
            const sessionRebindContext = await documentService.sessionRebindContext(
              ctx,
              input.docId,
              input.layerName,
            );
            let committed: { result: SignatureCompleteResult; auditId: number };
            try {
              committed = await this.commitSignature(ctx, {
                docId: input.docId,
                layerName: input.layerName,
                layer,
                signing,
                finalized,
                versionKey,
                cms: input.cms,
                sessionRebindContext,
              });
            } catch (err) {
              if (err instanceof AlreadyCompleted) {
                return this.replayCompletion(err.signing, input.cms);
              }
              if (
                err instanceof LayerFenceConflict ||
                (err instanceof EngineError && err.code === EngineErrorCode.SigningVersionMismatch)
              ) {
                // A CMS signs the exact bytes its digest covers; those bytes
                // are no longer publishable. End the signing so the layer is
                // writable again; the client prepares anew.
                await this.discardSigning(signing);
                throw new EngineError(
                  EngineErrorCode.SigningVersionMismatch,
                  'the document or layer moved since prepare; prepare again',
                );
              }
              throw err;
            }

            // 5. Sessions over the old base are garbage, here and everywhere.
            await documentService.onBaseVersionPublished(input.docId);
            this.publishMutation(ctx, input.docId, committed.auditId);
            this.publishBaseChanged(ctx, input.docId);
            return committed.result;
          },
        );
      } finally {
        baseFile.release();
      }
    });
  }

  /** Cancel: forget a pending signing and its tail. */
  async cancelSignature(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; signingId: string },
  ): Promise<SignatureCancelResult> {
    const signings = this.requireSignings();
    const signing = await signings.find(input.signingId);
    if (
      !signing ||
      signing.docId !== input.docId ||
      signing.layerName !== input.layerName ||
      signing.tenantId !== ctx.tenantId
    ) {
      return { status: 'unknown' };
    }
    if (signing.state === 'completed') return { status: 'already-completed' };
    if (signing.state !== 'prepared') return { status: 'unknown' };
    await this.discardSigning(signing);
    return { status: 'cancelled' };
  }

  /** The sweep tick: expire pending signings past their deadline and drop their tails. */
  async expireSignings(now = Date.now()): Promise<number> {
    if (!this.signings) return 0;
    const expired = await this.signings.expireDue(now);
    for (const row of expired) {
      await this.requireStorage()
        .delete(row.tailKey)
        .catch(() => undefined);
    }
    return expired.length;
  }

  /** Newest first; the versions listing joins these to the catalog. */
  async listSignings(ctx: LayerWriteContext, docId: string): Promise<SigningRow[]> {
    const signings = this.requireSignings();
    return (await signings.listForDocument(docId)).filter((s) => s.tenantId === ctx.tenantId);
  }

  private async discardSigning(signing: SigningRow): Promise<void> {
    const moved = await this.requireSignings().transition(
      this.requireDb(),
      signing.id,
      'prepared',
      'aborted',
      { finishedAt: Date.now() },
    );
    if (moved) {
      await this.requireStorage()
        .delete(signing.tailKey)
        .catch(() => undefined);
    }
  }

  private replayCompletion(signing: SigningRow, cms: Uint8Array): SignatureCompleteResult {
    if (signing.cmsSha256 !== sha256Hex(cms) || !signing.resultJson) {
      throw new EngineError(
        EngineErrorCode.SignatureRefused,
        'this signing already completed with a different CMS',
      );
    }
    const result = JSON.parse(signing.resultJson) as SignatureCompleteResult;
    return { ...result, status: 'already-completed' };
  }

  /** The durable identity of the signature field, from the layer session's snapshot. */
  private async resolveSignatureField(
    docId: string,
    layerName: string,
    field: FormFieldRef,
    signal?: AbortSignal,
  ): Promise<number> {
    const payload = await this.requirePool().run(
      docId,
      (jobId: WorkerJobId) =>
        wirePack({ kind: 'signatures.list' as const, jobId, docId, layerName }),
      signal,
    );
    if (payload.tag !== 'signatures.list') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload: ${payload.tag}`);
    }
    const match = payload.snapshot.signatures.find((s) =>
      field.kind === 'objectNumber'
        ? s.field.kind === 'objectNumber' && s.field.fieldObjectNumber === field.fieldObjectNumber
        : s.fieldName === field.name,
    );
    if (!match || match.field.kind !== 'objectNumber') {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no signature field ${field.kind === 'fqn' ? `'${field.name}'` : `#${field.fieldObjectNumber}`}`,
      );
    }
    return match.field.fieldObjectNumber;
  }

  private async uploadSigningTail(
    ctx: LayerWriteContext,
    docId: string,
    signingId: string,
    baseByteLength: number,
  ): Promise<{ key: string; sha256: string; size: number }> {
    if (!this.signingRoot) {
      throw new EngineError(EngineErrorCode.Unknown, 'signing is not configured (no signing root)');
    }
    const candidatePath = signingCandidatePath(this.signingRoot, signingId);
    const info = await stat(candidatePath);
    if (info.size <= baseByteLength) {
      throw new EngineError(EngineErrorCode.Unknown, 'the candidate is not longer than its base');
    }
    const size = info.size - baseByteLength;
    const key = StorageKeys.signingTail(ctx.tenantId, docId, signingId);
    const put = await this.requireStorage().put(
      key,
      createReadStream(candidatePath, { start: baseByteLength }),
      { contentLength: size },
    );
    return { key, sha256: put.sha256, size };
  }

  /**
   * The published version's object. The key is the content, so two
   * completions of one signing racing on two replicas write identical
   * bytes to one key: whichever put lands first is the object, the other
   * finds it there (a store whose atomic write uses one staging path per
   * key fails the loser's rename) and verifies the sha instead of failing.
   */
  private async uploadVersionObject(
    key: string,
    candidatePath: string,
    version: { sha256: string; byteLength: number },
  ): Promise<void> {
    const storage = this.requireStorage();
    const alreadyThere = async (): Promise<boolean> =>
      (await storage.exists(key)) && (await storage.getSha256(key)) === version.sha256;
    if (await alreadyThere()) return;
    try {
      const put = await storage.put(key, createReadStream(candidatePath), {
        contentLength: version.byteLength,
      });
      if (put.sha256 !== version.sha256) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          'the sealed bytes changed between sealing and upload',
        );
      }
    } catch (err) {
      if (await alreadyThere()) return;
      throw err;
    }
  }

  /** base ⊕ tail into `candidatePath`, both verified: the cache checked the base's sha, the store checks the tail's. */
  private async materializeCandidate(
    base: LocalFileHandle,
    signing: SigningRow,
    candidatePath: string,
  ): Promise<void> {
    if (base.size !== signing.baseByteLength || base.sha256 !== signing.expectedBaseSha) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'the base file does not match the version the signing was prepared on',
      );
    }
    const tailPath = join(dirname(candidatePath), 'tail.bin');
    const tail = await this.requireStorage().materializeLocal(signing.tailKey, tailPath, {
      expectedSha: signing.tailSha,
    });
    if (tail.size !== signing.tailSize) {
      throw new EngineError(EngineErrorCode.Unknown, 'the signing tail changed size in storage');
    }
    await copyFile(base.path, candidatePath);
    await pipeline(createReadStream(tailPath), createWriteStream(candidatePath, { flags: 'a' }));
    const info = await stat(candidatePath);
    if (info.size !== signing.baseByteLength + signing.tailSize) {
      throw new EngineError(EngineErrorCode.Unknown, 'the rebuilt candidate has the wrong length');
    }
  }

  /**
   * The publish transaction. Lock order for a transaction touching more
   * than one row of a document (law 9d): the signing row, the document
   * row, then layers in id order.
   */
  private async commitSignature(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      layer: LayerRow;
      signing: SigningRow;
      finalized: {
        signature: SignatureCompleteResult['signature'];
        protection: SignatureCompleteResult['protection'];
        version: SignatureCompleteResult['version'];
      };
      versionKey: string;
      cms: Uint8Array;
      sessionRebindContext: { binding: PasswordSessionBinding; unlockKey: string } | null;
    },
  ): Promise<{ result: SignatureCompleteResult; auditId: number }> {
    const signings = this.requireSignings();
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const { signing, finalized, layer } = input;
        const cmsSha = sha256Hex(input.cms);
        const widgetPage = finalized.signature.widget?.page?.pageObjectNumber ?? null;

        // (1) The signing row first, under its expiry: the single arbiter
        //     across replicas.
        const claimed = await signings.transition(
          trx,
          signing.id,
          'prepared',
          'completed',
          { cmsSha256: cmsSha, resultSha: finalized.version.sha256, finishedAt: now },
          { notExpiredAt: now },
        );
        if (!claimed) {
          const current = await signings.find(signing.id, trx);
          if (current?.state === 'completed' && current.cmsSha256 === cmsSha) {
            throw new AlreadyCompleted(current);
          }
          if (current?.state === 'completed') {
            throw new EngineError(
              EngineErrorCode.SignatureRefused,
              'this signing already completed with a different CMS',
            );
          }
          throw new EngineError(
            EngineErrorCode.SigningExpired,
            `signing '${signing.id}' is ${current?.state ?? 'gone'}`,
          );
        }

        // (2) Fence two: the head did not move since prepare. Its docVersion
        //     advances so every doc-level pinned family re-resolves.
        const moved = await trx
          .updateTable('documents')
          .set({
            base_sha: finalized.version.sha256,
            storage_size_bytes: finalized.version.byteLength,
            doc_version: sql`doc_version + 1`,
            updated_at: now,
          })
          .where('id', '=', input.docId)
          .where('base_sha', '=', signing.expectedBaseSha)
          .executeTakeFirst();
        if (Number(moved?.numUpdatedRows ?? 0) !== 1) {
          throw new EngineError(
            EngineErrorCode.SigningVersionMismatch,
            'the document head moved since prepare',
          );
        }

        // (3) Fence one: the layer is exactly what the candidate consumed.
        //     It becomes an empty workspace over the new version.
        const currentLayer = await trx
          .selectFrom('layers')
          .select(['current_version', 'doc_version'])
          .where('id', '=', layer.id)
          .executeTakeFirst();
        const layerDocVersion = Number(currentLayer?.doc_version ?? layer.docVersion);
        const nextVersion = signing.expectedLayerVersion + 1;
        await this.guardedVersionBump(
          trx,
          {
            id: layer.id,
            currentVersion: signing.expectedLayerVersion,
            docVersion: layerDocVersion,
          },
          {
            base_sha: finalized.version.sha256,
            current_version: nextVersion,
            current_artifact_key: null,
            current_artifact_sha: null,
            current_artifact_size: null,
            doc_version: layerDocVersion + 1,
            updated_at: now,
          },
        );

        // (4) The version row, numbered after the fenced parent; carries
        //     the layer's plane pointers (law 9). A document committed
        //     before the catalog existed has no row for its upload: this
        //     first publish materializes version 1 for it (the fence above
        //     proved the sha is the head).
        let parent = await this.layerState.repos.baseVersions.find(
          input.docId,
          signing.expectedBaseSha,
          trx,
        );
        if (!parent) {
          await this.layerState.repos.baseVersions.insertInitial(
            {
              tenantId: ctx.tenantId,
              docId: input.docId,
              sha256: signing.expectedBaseSha,
              byteLength: signing.baseByteLength,
              createdAt: now,
            },
            trx,
          );
          parent = await this.layerState.repos.baseVersions.require(
            input.docId,
            signing.expectedBaseSha,
            trx,
          );
        }
        await this.layerState.repos.baseVersions.insertPublished(trx, {
          tenantId: ctx.tenantId,
          docId: input.docId,
          sha256: finalized.version.sha256,
          byteLength: finalized.version.byteLength,
          parent,
          signingId: signing.id,
          storageKey: input.versionKey,
          layoutVersion: layer.layoutVersion,
          metadataVersion: layer.metadataVersion,
          attachmentsVersion: layer.attachmentsVersion,
          annotationsVersion: layer.annotationsVersion,
          createdAt: now,
        });

        // (5) Promote the whole layer into the base catalog; every sibling's
        //     manifest body changes too (scopes flip), so their docVersion
        //     advances — in id order.
        const promoted = await this.layerState.promoteLayerToBase(trx, {
          docId: input.docId,
          layerId: layer.id,
          signedPage: widgetPage,
          now,
        });
        const siblings = await trx
          .selectFrom('layers')
          .select('id')
          .where('doc_id', '=', input.docId)
          .where('id', '!=', layer.id)
          .orderBy('id')
          .execute();
        for (const sibling of siblings) {
          await trx
            .updateTable('layers')
            .set({ doc_version: sql`doc_version + 1`, updated_at: now })
            .where('id', '=', sibling.id)
            .execute();
        }

        // (6) The completer's password session follows the version.
        if (input.sessionRebindContext && this.passwordSessions) {
          await this.passwordSessions.rebind(
            trx,
            input.sessionRebindContext.binding,
            { ...input.sessionRebindContext.binding, baseSha: finalized.version.sha256 },
            input.sessionRebindContext.unlockKey,
            now,
          );
        }

        // (7) The response, complete before it is audited.
        const result: SignatureCompleteResult = {
          status: 'completed',
          signature: finalized.signature,
          version: finalized.version,
          previous: {
            baseSha256: signing.expectedBaseSha,
            editsVersion: signing.expectedLayerVersion,
          },
          protection: finalized.protection,
          meta: {
            affectedPages: promoted.map((page) =>
              this.layerState.decorateLayerPageState(input.docId, input.layerName, page),
            ),
            // No delta: a publish changes more of the manifest than a delta
            // carries; the client refreshes its manifest on completion.
            cacheDelta: null,
          },
        };
        const auditEvent = makeAuditEvent({
          ctx,
          docId: input.docId,
          layer,
          layerName: input.layerName,
          kind: 'signature.completed',
          pageObjectNumber: widgetPage,
          affectedPages: widgetPage !== null ? [widgetPage] : [],
          artifactVersion: nextVersion,
          artifactKey: input.versionKey,
          artifactSha: finalized.version.sha256,
          artifactSize: finalized.version.byteLength,
          payload: result,
          ts: now,
        });
        const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;
        if (auditId > 0) {
          await trx
            .updateTable('layers')
            .set({ last_audit_id: auditId })
            .where('id', '=', layer.id)
            .execute();
        }
        await signings.transition(trx, signing.id, 'completed', 'completed', {
          resultJson: JSON.stringify(result),
        });
        return { result, auditId };
      });
  }

  private publishBaseChanged(ctx: LayerWriteContext, docId: string): void {
    void this.realtime
      ?.publishBaseChanged({ tenantId: ctx.tenantId, docId })
      .catch(() => undefined);
  }

  private requireSignings(): DocumentSigningsRepo {
    if (!this.signings) {
      throw new EngineError(EngineErrorCode.Unknown, 'signing is not configured on this server');
    }
    return this.signings;
  }

  private async guardedVersionBump(
    trx: Transaction<Schema>,
    layer: Pick<LayerRow, 'id' | 'currentVersion' | 'docVersion'>,
    set: Record<string, number | string | bigint | null>,
  ): Promise<void> {
    // Two fences: the write serial (a concurrent write) and the doc
    // version (a sibling's publish advanced this row's `doc_version` under
    // us, law 9d) — either moved means the write was aligned on a stale
    // row and must rebase.
    const result = await trx
      .updateTable('layers')
      .set(set)
      .where('id', '=', layer.id)
      .where('current_version', '=', layer.currentVersion)
      .where('doc_version', '=', layer.docVersion)
      .executeTakeFirst();
    if (Number(result?.numUpdatedRows ?? 0) !== 1) {
      throw new LayerFenceConflict(
        `layer version moved while committing ${layer.id} (prepared=${layer.currentVersion})`,
      );
    }
  }

  /** Advance the layer row: version pointers, artifact epoch, and the
   *  realtime cursor (`last_audit_id` — written in the same transaction as
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
      annotations_version?: number;
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

  /** Ring the cross-replica doorbell — strictly after the commit resolved,
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
   * worker applied the mutation, so its in-memory state is `nextVersion`),
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
   * Per-attempt upload key for the artifact a mutation is about to save.
   * Never a bare version key: uploads happen before the commit CAS, and
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

        // The finalized result — audited and returned identically: what we
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

        // The finalized result — audited and returned identically: what we
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
   * LayerFenceConflict} means a remote replica committed between this op's
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
   * - **No ghost writes.** any escaping failure invalidates the session:
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
        //  - LayerFenceConflict: a remote replica committed in our window.
        //  - DocNotOpen at apply: the op parked across an engine respawn
        //    (crash or recycle) and dispatched into a successor without
        //    the session. Nothing applied — no ghost — so the rerun is
        //    exactly the fence-conflict recovery. (The read-path twin is
        //    `runReadWithReopen`.)
        const parkedAcrossRespawn =
          err instanceof EngineError && err.code === EngineErrorCode.DocNotOpen;
        if (!(err instanceof LayerFenceConflict) && !parkedAcrossRespawn) throw err;
        if (err instanceof LayerFenceConflict) {
          // Count one cross-replica write race per rebase. The
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

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
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
  /** The request's `Idempotency-Key`, for the changes a retry must not repeat. */
  idempotencyKey?: string | null;
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
    idempotencyKey: input.idempotencyKey ?? null,
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
  widgets: ReadonlyArray<FormWidget>,
  kind: MutationImpactKind,
): FormPageImpact[] {
  // A widget stored as a direct object has no page to attribute the
  // impact to (`page === null`) — it cannot be addressed at all.
  return widgets.flatMap((widget) =>
    widget.page === null ? [] : [{ pageObjectNumber: widget.page.pageObjectNumber, kind }],
  );
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
      `annotation mutation returned unknown weak annotation state for page ${page.page.pageObjectNumber}`,
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
 *     fixtures without identity claims), or
 *   - the identity has neither `userId` nor `groupId` nor
 *     `displayName` (nothing meaningful to stamp)
 *
 * The worker treats an absent actor as "stamp /M only, skip EMBD_Metadata".
 */
function actorFromContext(ctx: LayerWriteContext): AnnotationActor | undefined {
  const id: Identity | undefined = ctx.jwt?.identity;
  if (!id) return undefined;
  const actor: AnnotationActor = {};
  if (id.userId) actor.userId = id.userId;
  if (id.groupId) actor.groupId = id.groupId;
  if (id.displayName) actor.displayName = id.displayName;
  // No fields set → nothing for the worker to stamp; signal absence.
  if (!actor.userId && !actor.groupId && !actor.displayName) return undefined;
  return actor;
}

/** The cache-impact view of a widget addressed by ref: an object-number address is a placed widget. */
function widgetOfRef(ref: AnnotationRef): FormWidget {
  return ref.kind === 'objectNumber'
    ? formWidget(ref.annotObjectNumber, ref.page)
    : formWidget(0, ref.page);
}
