import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { profileFor, verifyForCompletion } from '@embedpdf/core-signature';
import type {
  ChangeAnswer,
  EditSessionAccess,
  EditSessionStatus,
  ObjectNumberRange,
  PdfMeasure,
  PageScaleResult,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  changeFingerprint,
  deserializeError,
  isUndoChange,
  serializeError,
  toPageRef,
  wirePack,
  type AnnotationActor,
  type ChangeAuthority,
  type ChangeOp,
  type ChangeRecordPayload,
  type PageCoordinates,
  type ServerChangeOutcome,
  type BundleLimits,
  type AnnotationCreateResult,
  type BundleImportPages,
  type AnnotationImportResult,
  type AnnotationDeleteResult,
  type AnnotationDraft,
  type AnnotationFlattenResult,
  type AnnotationPosition,
  type AnnotationReorderResult,
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
  type FormResetResult,
  type FormSetValueResult,
  type FormSnapshot,
  type FormWidgetLinkResult,
  type FormWidgetDeleteResult,
  type FormWidgetUpdateResult,
  type FormWidgetsReorderResult,
  type FormCalculationsReorderResult,
  type FieldPosition,
  type WidgetPatch,
  type FormWidget,
  type Identity,
  type WidgetPlacement,
  type MetadataPatch,
  type MetadataUpdateResult,
  type CustomMetadataPatch,
  type CustomMetadataUpdateResult,
  type CacheDelta,
  type MutationMeta,
  type PageDeleteResult,
  type PageFlattenResult,
  type PageFlattenUsage,
  type PageInsertResult,
  type PdfSize,
  type RedactionApplyResult,
  type RedactionApplyScope,
  type PageListSnapshot,
  type PagePosition,
  type PageReorderResult,
  type PageNameResult,
  type PageObjectNumber,
  type PageRef,
  type PageRotateResult,
  type PdfRotation,
  type WirePack,
  type WorkerJobId,
  type WorkerRequest,
  type WorkerResultPayload,
  type WireAttachmentFile,
  type AttachmentRef,
  type AttachmentCreateResult,
  type AttachmentDeleteResult,
  type DocumentVersionRef,
  type SignatureCancelResult,
  type SignatureCompleteResult,
  type SignaturePrepareInput,
  type SignaturePrepared,
  type AnnotationAuthority,
} from '@embedpdf/engine-core/runtime';
import {
  SignaturePreparedWireSchema,
  decodePrepared,
  encodePrepared,
} from '@embedpdf/engine-core/wire';
import { packChangeRecord, unpackChangeRecord } from '@embedpdf/engine-services';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { DocumentService, OpenContext } from './DocumentService';
import type { AuditEvent, EventLogService } from './EventLogService';
import {
  answerOf,
  changeRetentionMs,
  checkedAuthority,
  factsOf,
  numbersNamedBy,
  objectNumberEstimateOf,
  refusedRow,
  reusedOpId,
  undoTargetOf,
  verbResultOf,
  withCacheDelta,
  wrote,
  type ChangeFacts,
  type ChangePlan,
  type RequestedChange,
  type SingleOpAudit,
} from './layerChanges';
import type { LayerStateService } from './LayerStateService';
import {
  LayerWriteObjectNumbers,
  OBJECT_NUMBER_ESTIMATES,
  type WriteObjectNumbersInput,
} from './LayerWriteObjectNumbers';
import { rangesOf } from './objectNumberBlocks';
import {
  FIRST_OBJECT_NUMBERS,
  MAX_OBJECT_NUMBER_RESERVATION,
  MAX_OBJECT_NUMBER_TOP_UP,
  objectNumberNotHeld,
  type EditSessionKey,
  type ObjectNumberService,
} from './ObjectNumberService';
import type { EngineCounters } from '../app/engine-counters';
import { RequestRateLimiter } from '../app/request-rate-limiter';
import { AuditLogRepo, type AuditMutationKind } from '../db/repos/audit_log.repo';
import { ChangeOutcomesRepo, type ChangeOutcomeRow } from '../db/repos/change_outcomes.repo';
import type { DocumentSigningsRepo, SigningRow } from '../db/repos/document_signings.repo';
import type { DocumentsRepo } from '../db/repos/documents.repo';
import type { DurablePageRow, LayerRow } from '../db/repos/page_state.repo';
import type { PdfPasswordSessionsRepo } from '../db/repos/pdf_password_sessions.repo';
import type { Database as Schema } from '../db/schema';
import { isUniqueViolation } from '../db/uniqueViolation';
import type { RealtimeBus } from '../realtime/RealtimeBus';
import type { BuildPack, EnginePool } from '../runtime/EnginePool';
import { signingCandidatePath } from '../runtime/signing-paths';
import type { PasswordSessionBinding } from '../security/password-session';
import type { LocalFileHandle } from '../storage/BaseFileCache';
import { StorageKeys } from '../storage/keys';
import type { ObjectStore } from '../storage/ObjectStore';

type LayerArtifactInput = { bytes: ArrayBuffer; size: number } | { path: string };

/**
 * Page addresses arrive on the wire as `PageRef`s (one kind: the canonical
 * `objectNumber`); everything this service persists — `layer_pages` rows,
 * audit rows — is keyed by the number. Unwrap once at
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
    return page.objectNumber;
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

/** A write its `Idempotency-Key` already committed: `payload` is the answer. */
class CommittedWrite extends Error {
  constructor(readonly payload: unknown) {
    super('already committed');
  }
}

export class LayerFenceConflict extends EngineError {
  constructor(message: string) {
    super(EngineErrorCode.LayerVersionConflict, message);
  }
}

/** The durable state a document mutation produced inside its transaction. Mutations
 *  are document-scoped, so 0..N pages may have been touched. */
interface CommittedDocumentMutation {
  pages: DurablePageRow[];
  previousLayerDocVersion: number;
  layerDocVersion: number;
  /** The form's new pin, for a form write. */
  formsVersion?: number;
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
  documentService?: DocumentService;
  eventLog?: EventLogService;
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
  /**
   * Object numbers handed to editing sessions (migration 032). Without it,
   * writes number their objects as the engine does, and a create naming a
   * number is refused.
   */
  objectNumbers?: ObjectNumberService;
}

export type LayerWriteContext = OpenContext;

/**
 * The guard against scripts: one token may be handed numbers by 30 requests
 * a minute (`/access`, the event stream, write top-ups); later ones get
 * none, and still succeed.
 */
const OBJECT_NUMBER_ISSUE_TURNS = { maxAttempts: 30, windowMs: 60_000 };

/** Whole seconds left of `ms`, rounded down: a client stops a little early, never late. */
function secondsOf(ms: number): number {
  return Math.max(0, Math.floor(ms / 1000));
}

/**
 * A write's id, as its result and events carry it: the request's
 * `Idempotency-Key` (the engine sends its `opId` there), or one minted for
 * the write.
 */
function writeOpIdOf(ctx: LayerWriteContext): string {
  return ctx.idempotencyKey ?? randomUUID();
}

/** The editing session a request acts as, on `layerId`. */
function editSessionKey(ctx: LayerWriteContext, layerId: string): EditSessionKey {
  if (!ctx.originSessionId) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'object numbers need an editing session: send X-Engine-Session-Id',
    );
  }
  return { layerId, sessionId: ctx.originSessionId, sub: ctx.sub };
}

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
  private readonly documentService?: DocumentService;
  private readonly eventLog?: EventLogService;
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
  /**
   * The object numbers of each layer write in flight (layer id → write):
   * made by {@link prepareLayerMutation}, used by {@link runLayerWrite} and
   * at the version fence, and given back by the write wrapper. One write
   * per layer runs at a time in a process (the layer write queue).
   */
  private readonly layerWrites = new Map<string, LayerWriteObjectNumbers>();
  /** The guard against scripts: how often one token may be handed numbers. */
  private readonly issueTurns = new RequestRateLimiter(OBJECT_NUMBER_ISSUE_TURNS);
  private readonly objectNumbers?: ObjectNumberService;

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
    this.documentService = opts.documentService;
    this.eventLog = opts.eventLog;
    this.pool = opts.pool;
    this.storage = opts.storage;
    this.realtime = opts.realtime;
    this.objectNumbers = opts.objectNumbers;
  }

  /**
   * Create or fetch the physical layer for a write.
   *
   * The initialized `layer_pages` rows copy only durable base topology.
   * The base document is immutable, so
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
            formsVersion: base.formsVersion,
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
      /** The object number the annotation gets: one the request's editing session holds. */
      objectNumber?: number;
    },
    signal?: AbortSignal,
  ): Promise<AnnotationCreateResult> {
    const actor = input.actor ?? actorFromContext(ctx);
    return this.applySingleOp<AnnotationCreateResult>(
      ctx,
      input,
      {
        type: 'annotations.create',
        page: toPageRef(input.pageObjectNumber),
        data: input.draft,
        ...(input.resources ? { resources: input.resources } : {}),
        ...(input.objectNumber !== undefined ? { objectNumber: input.objectNumber } : {}),
      },
      checkedAuthority(actor),
      'annot.create',
      signal,
    );
  }

  /**
   * `doc.annotations.import` on a layer: one worker job, whose failure
   * leaves the session as it was, then one artifact, one commit across every
   * page it touched and one audit row.
   */
  async importAnnotations(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      bundle: WireAnnotationBundle;
      pages?: BundleImportPages;
      attribution: 'restore' | 'stamp';
      /** The caller's identity, which `'stamp'` attributes each annotation to. */
      actor?: AnnotationActor;
      limits: BundleLimits;
    },
    signal?: AbortSignal,
  ): Promise<AnnotationImportResult> {
    const opId = writeOpIdOf(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack(
            {
              kind: 'annotations.import' as const,
              effect: 'write' as const,
              jobId,
              opId,
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
        const payload = await this.runLayerWrite(input.docId, build, signal);
        if (payload.tag !== 'annotations.import') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected annotations.import payload: ${payload.tag}`,
          );
        }
        // Everything was left out: nothing was written, nothing to commit.
        if (payload.result.annotations.length === 0) return payload.result;
        return this.persistAnnotationImport(ctx, input.docId, input.layerName, layer, {
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
      patch: AnnotationPatch;
      /** The bytes beside the patch, by role (multipart `resource:{role}` parts). */
      resources?: WireAnnotationResources;
      /** Who the update acts for and what they may do, checked inside the write. */
      authority: AnnotationAuthority;
    },
    signal?: AbortSignal,
  ): Promise<AnnotationUpdateResult> {
    return this.applySingleOp<AnnotationUpdateResult>(
      ctx,
      input,
      {
        type: 'annotations.update',
        ref: input.ref,
        patch: input.patch,
        ...(input.resources ? { resources: input.resources } : {}),
      },
      { ...input.authority, protection: null },
      'annot.update',
      signal,
    );
  }

  async deleteAnnotation(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      ref: AnnotationRef;
      /** Who the delete acts for and what they may do, checked inside the write. */
      authority: AnnotationAuthority;
    },
    signal?: AbortSignal,
  ): Promise<AnnotationDeleteResult> {
    return this.applySingleOp<AnnotationDeleteResult>(
      ctx,
      input,
      { type: 'annotations.delete', ref: input.ref },
      { ...input.authority, protection: null },
      'annot.delete',
      signal,
    );
  }

  async reorderAnnotations(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      pageObjectNumber: PageObjectNumber;
      refs: AnnotationRef[];
      position: AnnotationPosition;
      /** Who the reorder acts for and what they may do, checked against each annotation it moves. */
      authority: AnnotationAuthority;
    },
    signal?: AbortSignal,
  ): Promise<AnnotationReorderResult> {
    return this.applySingleOp<AnnotationReorderResult>(
      ctx,
      input,
      {
        type: 'annotations.reorder',
        page: toPageRef(input.pageObjectNumber),
        refs: input.refs,
        position: input.position,
      },
      { ...input.authority, protection: null },
      'annot.reorder',
      signal,
    );
  }

  async reorderPages(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      pages: PageRef[];
      position: PagePosition;
    },
    signal?: AbortSignal,
  ): Promise<PageReorderResult> {
    const opId = writeOpIdOf(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'pages.reorder' as const,
            effect: 'contentWrite' as const,
            jobId,
            opId,
            docId: input.docId,
            layerName: input.layerName,
            pages: input.pages,
            position: input.position,
            artifactPath,
          });
        const payload = await this.runLayerWrite(input.docId, build, signal);
        if (payload.tag !== 'pages.reorder') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected pages.reorder payload: ${payload.tag}`,
          );
        }
        return this.persistPageLayout(ctx, input.docId, input.layerName, layer, {
          result: payload.result,
          pages: payload.result.pages,
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
    const opId = writeOpIdOf(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.runLayerWrite(
          input.docId,
          (jobId: WorkerJobId) =>
            wirePack({
              kind: 'measure.setScale' as const,
              effect: 'write' as const,
              jobId,
              opId,
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
          touchedPages: [],
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
    const opId = writeOpIdOf(ctx);
    return this.runPageNameMutation(
      ctx,
      input.docId,
      input.layerName,
      (jobId, artifactPath) =>
        wirePack({
          kind: 'pages.setName' as const,
          effect: 'write' as const,
          jobId,
          opId,
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
    const opId = writeOpIdOf(ctx);
    return this.runPageNameMutation(
      ctx,
      input.docId,
      input.layerName,
      (jobId, artifactPath) =>
        wirePack({
          kind: 'pages.removeName' as const,
          effect: 'write' as const,
          jobId,
          opId,
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
        const payload = await this.runLayerWrite(
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
        // Layout-shaped result: the reorder's persistence, with no page moved.
        return this.persistPageLayout(ctx, docId, layerName, layer, {
          result: payload.result,
          pages: [],
          artifact: requireLayerArtifact(payload as unknown),
        });
      });
    });
  }

  /**
   * `pages.flatten` for a chosen set of one page's annotations. The same
   * persistence as a page flatten (content + annotation versions of that
   * page advance, a new layer artifact).
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
    const opId = writeOpIdOf(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.runLayerWrite(
          input.docId,
          (jobId) =>
            wirePack({
              kind: 'annotations.flatten' as const,
              effect: 'contentWrite' as const,
              jobId,
              opId,
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
        if (!payload.wrote) return payload.result;
        return this.persistPageFlatten(ctx, input.docId, input.layerName, layer, {
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
      pages: PageRef[];
      rotation: PdfRotation;
    },
    signal?: AbortSignal,
  ): Promise<PageRotateResult> {
    const opId = writeOpIdOf(ctx);
    const pageObjectNumbers = pageObjectNumbersOf(input.pages);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'pages.rotate' as const,
            effect: 'contentWrite' as const,
            jobId,
            opId,
            docId: input.docId,
            layerName: input.layerName,
            pages: input.pages,
            rotation: input.rotation,
            artifactPath,
          });
        const payload = await this.runLayerWrite(input.docId, build, signal);
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
    const opId = writeOpIdOf(ctx);
    const pageObjectNumbers = pageObjectNumbersOf(input.pages);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'pages.delete' as const,
            effect: 'contentWrite' as const,
            jobId,
            opId,
            docId: input.docId,
            layerName: input.layerName,
            pages: input.pages,
            artifactPath,
          });
        const payload = await this.runLayerWrite(input.docId, build, signal);
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
      position?: PagePosition;
    },
    signal?: AbortSignal,
  ): Promise<PageInsertResult> {
    const opId = writeOpIdOf(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName, {
        estimate: OBJECT_NUMBER_ESTIMATES.insertedPages(input.bytes.byteLength),
      });
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'pages.insert' as const,
            effect: 'contentWrite' as const,
            jobId,
            opId,
            docId: input.docId,
            layerName: input.layerName,
            bytes: input.bytes,
            ...(input.position !== undefined ? { position: input.position } : {}),
            artifactPath,
          });
        const payload = await this.runLayerWrite(input.docId, build, signal);
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
      position?: PagePosition;
      /** The new pages' object numbers, one per page: ones the editing session holds. */
      objectNumbers?: readonly number[];
    },
    signal?: AbortSignal,
  ): Promise<PageInsertResult> {
    const opId = writeOpIdOf(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName, {
        estimate: OBJECT_NUMBER_ESTIMATES.blankPages(input.count ?? 1),
        ...(input.objectNumbers ? { named: input.objectNumbers } : {}),
      });
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'pages.insertBlank' as const,
            effect: 'contentWrite' as const,
            jobId,
            opId,
            docId: input.docId,
            layerName: input.layerName,
            size: input.size,
            ...(input.count !== undefined ? { count: input.count } : {}),
            ...(input.position !== undefined ? { position: input.position } : {}),
            ...(input.objectNumbers ? { objectNumbers: [...input.objectNumbers] } : {}),
            artifactPath,
          });
        const payload = await this.runLayerWrite(input.docId, build, signal);
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
    const opId = writeOpIdOf(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.runLayerWrite(
          input.docId,
          (jobId) =>
            wirePack({
              kind: 'pages.flatten' as const,
              effect: 'contentWrite' as const,
              jobId,
              opId,
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
        if (!payload.wrote) return payload.result;
        return this.persistPageFlatten(ctx, input.docId, input.layerName, layer, {
          result: payload.result,
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
    const opId = writeOpIdOf(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.runLayerWrite(
          input.docId,
          (jobId) =>
            wirePack({
              kind: 'redaction.apply' as const,
              effect: 'contentWrite' as const,
              jobId,
              opId,
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
        if (!payload.wrote) return payload.result;
        return this.persistRedactionApply(ctx, input.docId, input.layerName, layer, {
          result: payload.result,
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
    return this.applySingleOp<MetadataUpdateResult>(
      ctx,
      input,
      { type: 'metadata.update', patch: input.patch },
      checkedAuthority(),
      'metadata.update',
      signal,
    );
  }

  /** The Info dict's custom keys: the same Info-dict write as `updateMetadata`. */
  async updateCustomMetadata(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      patch: CustomMetadataPatch;
    },
    signal?: AbortSignal,
  ): Promise<CustomMetadataUpdateResult> {
    return this.applySingleOp<CustomMetadataUpdateResult>(
      ctx,
      input,
      { type: 'metadata.updateCustom', patch: input.patch },
      checkedAuthority(),
      'metadata.updateCustom',
      signal,
    );
  }

  // ── Attachments ──────────────────────────────────────────────────────
  //
  // Document-scoped like metadata: the /EmbeddedFiles name tree lives on
  // the catalog, so mutations touch no page rows — they advance the layer
  // doc version plus the dedicated `attachments_version` pin that keys
  // the immutable /attachments@… and /attachment-files/…@… leaves.
  // Identity is the name-tree key (unique by construction).

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
    const opId = writeOpIdOf(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'attachments.create' as const,
            effect: 'write' as const,
            jobId,
            opId,
            docId: input.docId,
            layerName: input.layerName,
            file: input.file,
            resources: input.resources,
            artifactPath,
          });
        const payload = await this.runLayerWrite(input.docId, build, signal);
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
      ref: AttachmentRef;
    },
    signal?: AbortSignal,
  ): Promise<AttachmentDeleteResult> {
    const opId = writeOpIdOf(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const { layer } = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const build = (jobId: WorkerJobId) =>
          wirePack({
            kind: 'attachments.delete' as const,
            effect: 'write' as const,
            jobId,
            opId,
            docId: input.docId,
            layerName: input.layerName,
            ref: input.ref,
            artifactPath,
          });
        const payload = await this.runLayerWrite(input.docId, build, signal);
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
  // version bumps — a widget change invalidates the same caches an
  // annotation write does.

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
        effect: 'read' as const,
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
        effect: 'snapshot' as const,
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
    return this.applySingleOp<FormSetValueResult>(
      ctx,
      input,
      { type: 'forms.setValue', field: input.ref, value: input.value },
      checkedAuthority(actorFromContext(ctx)),
      'form.setValue',
      signal,
    );
  }

  /** Reset the fields named, or the whole form without `refs`. */
  async resetForm(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; refs?: FormFieldRef[] },
    signal?: AbortSignal,
  ): Promise<FormResetResult> {
    return this.applySingleOp<FormResetResult>(
      ctx,
      input,
      { type: 'forms.reset', ...(input.refs ? { fields: input.refs } : {}) },
      checkedAuthority(),
      'form.reset',
      signal,
    );
  }

  async applyFormEffects(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; effects: FormEffect[] },
    signal?: AbortSignal,
  ): Promise<FormEffectsResult> {
    const opId = writeOpIdOf(ctx);
    // The scripts' values count as filled in by the user whose fill ran them.
    const actor = actorFromContext(ctx);
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const materialized = await this.prepareLayerMutation(ctx, input.docId, input.layerName);
      const { layer } = materialized;
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.runLayerWrite(
          input.docId,
          (jobId) =>
            wirePack({
              kind: 'forms.applyEffects' as const,
              effect: 'write' as const,
              jobId,
              opId,
              docId: input.docId,
              layerName: input.layerName,
              effects: input.effects,
              artifactPath,
              ...(actor ? { actor } : {}),
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

        const touchedPages = widgetPages(result.meta.changedWidgets);
        const failed = result.results.filter((entry) => entry.status === 'failed');
        for (const entry of failed) {
          touchedPages.push(...widgetPages(entry.fields.flatMap((field) => field.widgets)));
        }
        // A failed native call is outcome-indeterminate. If its field could
        // not be re-read, invalidate every page rather than under-reporting
        // a possibly changed widget appearance.
        const conservativePages = failed.some((entry) => entry.fields.length === 0)
          ? allPages(materialized)
          : touchedPages;

        return this.persistDocumentMutation(ctx, input.docId, input.layerName, layer, {
          auditKind: 'form.applyEffects',
          touchedPages: conservativePages,
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
    const opId = writeOpIdOf(ctx);
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
              effect: 'write' as const,
              jobId,
              opId,
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
        touchedPages: (_result: FormImportResult, materialized) => allPages(materialized),
      },
      signal,
    );
  }

  async repairForm(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; bakeAppearances: boolean },
    signal?: AbortSignal,
  ): Promise<FormRepairResult> {
    const opId = writeOpIdOf(ctx);
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
            effect: 'write' as const,
            jobId,
            opId,
            docId: input.docId,
            layerName: input.layerName,
            bakeAppearances: input.bakeAppearances,
            artifactPath,
          }),
        // Repair may bake appearances for widgets anywhere in the document.
        touchedPages: (_result: FormRepairResult, materialized) => allPages(materialized),
      },
      signal,
    );
  }

  async createFormField(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      draft: FormFieldDraft;
      /** The field's object number: one the editing session holds. */
      objectNumber?: number;
      /** Its widgets', in `draft.widgets` order: ones the editing session holds. */
      widgetObjectNumbers?: readonly number[];
    },
    signal?: AbortSignal,
  ): Promise<FormFieldCreateResult> {
    return this.applySingleOp<FormFieldCreateResult>(
      ctx,
      input,
      {
        type: 'forms.create',
        draft: input.draft,
        ...(input.objectNumber !== undefined ? { objectNumber: input.objectNumber } : {}),
        ...(input.widgetObjectNumbers ? { widgetObjectNumbers: input.widgetObjectNumbers } : {}),
      },
      checkedAuthority(actorFromContext(ctx)),
      'form.createField',
      signal,
    );
  }

  async updateFormField(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; ref: FormFieldRef; patch: FormFieldPatch },
    signal?: AbortSignal,
  ): Promise<FormFieldUpdateResult> {
    return this.applySingleOp<FormFieldUpdateResult>(
      ctx,
      input,
      { type: 'forms.update', field: input.ref, patch: input.patch },
      checkedAuthority(),
      'form.updateField',
      signal,
    );
  }

  /** The visual fill of an unsigned signature field: a one-page PDF drawn into its widgets, nothing sealed. */
  async setSignatureAppearance(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      ref: FormFieldRef;
      pdf: Uint8Array;
    },
    signal?: AbortSignal,
  ): Promise<FormFieldUpdateResult> {
    return this.applySingleOp<FormFieldUpdateResult>(
      ctx,
      input,
      {
        type: 'forms.setSignatureAppearance',
        field: input.ref,
        appearance: { pdf: input.pdf },
      },
      checkedAuthority(),
      'form.setSignatureAppearance',
      signal,
    );
  }

  async deleteFormField(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; ref: FormFieldRef },
    signal?: AbortSignal,
  ): Promise<FormFieldDeleteResult> {
    return this.applySingleOp<FormFieldDeleteResult>(
      ctx,
      input,
      { type: 'forms.delete', field: input.ref },
      checkedAuthority(),
      'form.deleteField',
      signal,
    );
  }

  /** Add a widget to a field, created where its placement says. */
  async addFormWidget(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      ref: FormFieldRef;
      placement: WidgetPlacement;
      /** The new widget's object number: one the editing session holds. */
      objectNumber?: number;
      /** Where a merged field's widget moves when it splits: one the editing session holds. */
      splitObjectNumber?: number;
    },
    signal?: AbortSignal,
  ): Promise<FormWidgetLinkResult> {
    return this.applySingleOp<FormWidgetLinkResult>(
      ctx,
      input,
      {
        type: 'forms.addWidget',
        field: input.ref,
        placement: input.placement,
        ...(input.objectNumber !== undefined ? { objectNumber: input.objectNumber } : {}),
        ...(input.splitObjectNumber !== undefined
          ? { splitObjectNumber: input.splitObjectNumber }
          : {}),
      },
      checkedAuthority(),
      'form.addWidget',
      signal,
    );
  }

  async detachFormWidget(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; ref: FormFieldRef; widget: AnnotationRef },
    signal?: AbortSignal,
  ): Promise<FormWidgetLinkResult> {
    return this.applySingleOp<FormWidgetLinkResult>(
      ctx,
      input,
      { type: 'forms.removeWidget', field: input.ref, widget: input.widget },
      checkedAuthority(),
      'form.detachWidget',
      signal,
    );
  }

  /** A widget leaves its page and its field: a form write, never an annotation delete. */
  async deleteFormWidget(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; widget: AnnotationRef },
    signal?: AbortSignal,
  ): Promise<FormWidgetDeleteResult> {
    return this.applySingleOp<FormWidgetDeleteResult>(
      ctx,
      input,
      { type: 'forms.deleteWidget', widget: input.widget },
      checkedAuthority(),
      'form.deleteWidget',
      signal,
    );
  }

  /** A widget's place and look: a form write, never an annotation update. */
  async updateFormWidget(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; widget: AnnotationRef; patch: WidgetPatch },
    signal?: AbortSignal,
  ): Promise<FormWidgetUpdateResult> {
    return this.applySingleOp<FormWidgetUpdateResult>(
      ctx,
      input,
      { type: 'forms.updateWidget', widget: input.widget, patch: input.patch },
      checkedAuthority(),
      'form.updateWidget',
      signal,
    );
  }

  async reorderFormWidgets(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      page: PageRef;
      widgets: AnnotationRef[];
      position: AnnotationPosition;
    },
    signal?: AbortSignal,
  ): Promise<FormWidgetsReorderResult> {
    return this.applySingleOp<FormWidgetsReorderResult>(
      ctx,
      input,
      {
        type: 'forms.reorderWidgets',
        page: input.page,
        widgets: input.widgets,
        position: input.position,
      },
      checkedAuthority(),
      'form.reorderWidgets',
      signal,
    );
  }

  /** The form's calculation order: `fields` go together to `position`. */
  async reorderFormCalculations(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; fields: FormFieldRef[]; position: FieldPosition },
    signal?: AbortSignal,
  ): Promise<FormCalculationsReorderResult> {
    return this.applySingleOp<FormCalculationsReorderResult>(
      ctx,
      input,
      { type: 'forms.reorderCalculations', fields: input.fields, position: input.position },
      checkedAuthority(),
      'form.reorderCalculations',
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
      /** The object numbers the write's creates name. */
      named?: readonly number[];
      build: (jobId: WorkerJobId, artifactPath: string) => WirePack<WorkerRequest>;
      touchedPages: (result: TResult, materialized: MaterializedLayer) => PageObjectNumber[];
    },
    signal?: AbortSignal,
  ): Promise<TResult> {
    return this.enqueueLayerWrite(ctx, input.docId, input.layerName, async () => {
      const materialized = await this.prepareLayerMutation(ctx, input.docId, input.layerName, {
        estimate: OBJECT_NUMBER_ESTIMATES.forms,
        ...(input.named?.length ? { named: input.named } : {}),
      });
      const { layer } = materialized;
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.runLayerWrite(
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
          touchedPages: input.touchedPages(result, materialized),
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
      touchedPages: PageObjectNumber[];
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
      touchedPages: [...new Set(input.touchedPages)],
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
   * construction) into the finalized wire result: the pages it touched and
   * the real cacheDelta from the committed version bumps.
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
      ...(durable.formsVersion !== undefined ? { formsVersion: durable.formsVersion } : {}),
      pages: durable.pages,
    });
    return {
      ...raw,
      meta: {
        ...raw.meta,
        affectedPages: durable.pages.map((page) => toPageRef(page.pageObjectNumber)),
        cacheDelta,
      },
    };
  }

  /**
   * Document mutation commit: advance the layer's `doc_version` (a new
   * artifact always exists), and the pins of the family it wrote: a form
   * write's `forms_version` and the widget version of every page it
   * touched, a calibration's annotation versions. Writes that draw nothing
   * (a repair that only links fields) legitimately touch zero pages — the
   * layer still advances so the new artifact becomes current.
   */
  private async commitDocumentMutation(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    kind: AuditMutationKind;
    touchedPages: PageObjectNumber[];
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

        // A form write moves the form's pins; a calibration its pages' annotations.
        const formWrite = input.kind.startsWith('form.');
        const nextPages: DurablePageRow[] = [];
        for (const pageObjectNumber of input.touchedPages) {
          const page = await trx
            .selectFrom('layer_pages')
            .selectAll()
            .where('layer_id', '=', input.layer.id)
            .where('page_object_number', '=', pageObjectNumber)
            .executeTakeFirst();
          if (!page) {
            throw new EngineError(
              EngineErrorCode.WireFormat,
              `form mutation reported unknown page object number ${pageObjectNumber}`,
            );
          }
          nextPages.push({
            pageObjectNumber: Number(page.page_object_number),
            contentVersion: Number(page.content_version),
            annotationVersion: Number(page.annotation_version) + (formWrite ? 0 : 1),
            widgetVersion: Number(page.widget_version) + (formWrite ? 1 : 0),
            updatedAt: now,
          });
        }

        const previousLayerDocVersion = Number(currentLayer.doc_version);
        const layerDocVersion = previousLayerDocVersion + 1;

        const durable: CommittedDocumentMutation = {
          pages: nextPages,
          previousLayerDocVersion,
          layerDocVersion,
          ...(formWrite ? { formsVersion: Number(currentLayer.forms_version ?? 1) + 1 } : {}),
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
        // A form repair is a final change: no change before it can be undone any more.
        if (input.kind === 'form.repair') await this.endUndoAt(trx, input.layer.id, auditId);

        await this.writeLayerAdvance(
          trx,
          input,
          {
            doc_version: layerDocVersion,
            ...(durable.formsVersion !== undefined ? { forms_version: durable.formsVersion } : {}),
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
              widget_version: page.widgetVersion,
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
    numbers: WriteObjectNumbersInput | (() => WriteObjectNumbersInput) = {},
    /**
     * Finds what an earlier attempt of this write already answered, before
     * anything is checked or run again: the write then answers that.
     */
    answered?: (layer: LayerRow) => Promise<unknown>,
  ): Promise<MaterializedLayer> {
    const documentService = this.requireDocumentService();
    await documentService.getLayerManifest(ctx, docId, layerName);
    const materialized = await this.materializeLayerForWrite(ctx, docId, layerName);
    // A retry of a write that committed gets what it committed, before
    // anything is checked or run again (its numbers are spent by now).
    const committed = await this.committedWrite(materialized.layer.id, ctx.idempotencyKey);
    if (committed) throw committed;
    const answer = answered ? await answered(materialized.layer) : undefined;
    if (answer !== undefined) throw new CommittedWrite(answer);
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
    await this.prepareObjectNumbers(
      ctx,
      materialized.layer,
      typeof numbers === 'function' ? numbers() : numbers,
    );
    return materialized;
  }

  /**
   * The write's object numbers (see LayerWriteObjectNumbers): the numbers
   * it names must be its session's, and it takes a range for the objects
   * the engine makes for itself. The layer's counter starts here the first
   * time, past what the engine reported when it opened the layer.
   */
  private async prepareObjectNumbers(
    ctx: LayerWriteContext,
    layer: LayerRow,
    numbers: WriteObjectNumbersInput,
  ): Promise<void> {
    if (!this.objectNumbers) {
      if (numbers.named?.length) throw objectNumberNotHeld(numbers.named[0]!);
      return;
    }
    const db = this.requireDb();
    await this.startObjectCounter(layer);
    let write = this.layerWrites.get(layer.id);
    if (!write) {
      write = new LayerWriteObjectNumbers(
        this.objectNumbers,
        db,
        layer.id,
        layer.docId,
        layer.name,
        ctx.originSessionId
          ? { layerId: layer.id, sessionId: ctx.originSessionId, sub: ctx.sub }
          : null,
        ctx.edit,
        ctx.edit && ctx.edit.topUp > 0 && this.takeIssueTurn(ctx) ? ctx.edit.topUp : 0,
      );
      this.layerWrites.set(layer.id, write);
    }
    await write.prepare(layer.baseSha, numbers);
  }

  /**
   * Run a layer write on the engine. Its request carries the write's object
   * number floor, and the layer's last object number the worker reports
   * with the saved artifact is kept for the commit.
   */
  private async runLayerWrite(
    docId: string,
    build: BuildPack,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    let write: LayerWriteObjectNumbers | undefined;
    const payload = await this.requirePool().run(
      docId,
      (jobId) => {
        const pack = build(jobId);
        const request = pack.payload;
        const layerName = 'layerName' in request ? request.layerName : undefined;
        write = [...this.layerWrites.values()].find(
          (candidate) => candidate.docId === docId && candidate.layerName === layerName,
        );
        if (
          write &&
          'effect' in request &&
          (request.effect === 'write' || request.effect === 'contentWrite')
        ) {
          (request as { objectNumberFloor?: number }).objectNumberFloor = write.floor;
        }
        return pack;
      },
      signal,
    );
    write?.recordResult(payload);
    return payload;
  }

  // ── changes ───────────────────────────────────────────────────────────────

  /**
   * A request's changes (`POST …/changes`) as one write. A change that
   * already has an answer gets it again, refusals included, and a different
   * change under a used opId is refused. The rest run in one engine job, each
   * in its own transaction, then one commit: one artifact, an audit row for
   * each change that wrote, an outcome row for each change answered. A lost
   * fence reruns all of it on the new head; nothing was stored for the lost
   * attempt.
   */
  async applyChanges(
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layerName: string;
      changes: readonly RequestedChange[];
      /** Who the changes act for: each op is checked against it inside the write. */
      authority: ChangeAuthority;
      /** A single-op route's change: its audit row keeps the route's kind and result. */
      single?: SingleOpAudit;
    },
    signal?: AbortSignal,
  ): Promise<ChangeAnswer[]> {
    // The outcome table answers retries; the audit log's replay (by
    // `Idempotency-Key`) stays out of it.
    const writeCtx: LayerWriteContext = { ...ctx, idempotencyKey: undefined };
    return this.enqueueLayerWrite(writeCtx, input.docId, input.layerName, async () => {
      // A request whose every change has its answer gets them, and nothing
      // else happens: its numbers were spent by the attempt that answered.
      let kept = new Map<string, ChangeOutcomeRow>();
      const { layer } = await this.prepareLayerMutation(
        writeCtx,
        input.docId,
        input.layerName,
        () => ({
          estimate: objectNumberEstimateOf(input.changes),
          named: numbersNamedBy(input.changes.filter(({ opId }) => !kept.has(opId))),
        }),
        async (current) => {
          kept = await this.keptOutcomes(current.id, input.changes);
          const answers = input.changes.map(({ opId, change }) => {
            const row = kept.get(opId);
            return row?.payloadHash === changeFingerprint(change) ? answerOf(row) : undefined;
          });
          return answers.every((answer) => answer !== undefined) ? answers : undefined;
        },
      );
      const plan = await this.planChanges(writeCtx, layer, input, kept);
      if (plan.run.length === 0) return this.commitChanges(writeCtx, input, layer, plan, [], null);
      return this.withTempWorkerFile('layer-artifact', 'artifact.layer', async (artifactPath) => {
        const payload = await this.runLayerWrite(
          input.docId,
          (jobId) =>
            wirePack({
              kind: 'document.applyChanges' as const,
              effect: 'write' as const,
              jobId,
              docId: input.docId,
              layerName: input.layerName,
              changes: plan.run,
              artifactPath,
            }),
          signal,
        );
        if (payload.tag !== 'document.applyChanges') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected document.applyChanges payload: ${payload.tag}`,
          );
        }
        const artifact =
          payload.artifact || payload.artifactFile ? requireLayerArtifact(payload) : null;
        return this.commitChanges(writeCtx, input, layer, plan, payload.outcomes, artifact);
      });
    });
  }

  /**
   * What a request's changes need before anything runs: the answers kept for
   * those that have one, the refusals of undos that may not run, and the
   * job's changes, an undo of a change outside the request carrying the
   * record that change left.
   */
  private async planChanges(
    ctx: LayerWriteContext,
    layer: LayerRow,
    input: { changes: readonly RequestedChange[]; authority: ChangeAuthority },
    kept: ReadonlyMap<string, ChangeOutcomeRow>,
  ): Promise<ChangePlan> {
    const now = Date.now();
    const horizon = await this.undoHorizonOf(layer.id);
    const plan: ChangePlan = { now, slots: [], run: [] };
    const running = new Set<string>();
    for (const { opId, change } of input.changes) {
      const fingerprint = changeFingerprint(change);
      const row = kept.get(opId);
      if (row && row.payloadHash !== fingerprint) {
        plan.slots.push({
          kind: 'refused',
          opId,
          fingerprint,
          error: reusedOpId(opId),
          keep: false,
        });
      } else if (row) {
        plan.slots.push({ kind: 'kept', answer: answerOf(row) });
      } else if (running.has(opId)) {
        const error = new EngineError(
          EngineErrorCode.InvalidArg,
          `opId ${opId} is in the request twice`,
        );
        plan.slots.push({ kind: 'refused', opId, fingerprint, error, keep: false });
      } else {
        const undoOf = isUndoChange(change) ? change.undoOf : null;
        let record: ChangeRecordPayload | null | undefined;
        // An undo of an earlier change of this request runs the record the job keeps.
        if (undoOf !== null && !running.has(undoOf)) {
          const target = undoTargetOf(undoOf, kept.get(undoOf), { sub: ctx.sub, horizon, now });
          if ('refusal' in target) {
            plan.slots.push({
              kind: 'refused',
              opId,
              fingerprint,
              error: target.refusal,
              keep: true,
            });
            continue;
          }
          record =
            target.reverse === null
              ? null
              : unpackChangeRecord(target.reverse, await this.readCapture(target.captureKey));
        }
        running.add(opId);
        plan.run.push({
          opId,
          change,
          authority: input.authority,
          ...(record !== undefined ? { record } : {}),
        });
        plan.slots.push({ kind: 'run', opId, fingerprint, undoOf });
      }
    }
    return plan;
  }

  /**
   * One commit for a request's changes: their captures first (one blob each),
   * the artifact when any change wrote, then one database transaction with
   * the bumps the changes' facts call for, an audit row for each that wrote,
   * one guarded version bump, and an outcome row for each change answered.
   * Returns the answers in request order, as the client gets them.
   */
  private async commitChanges(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; single?: SingleOpAudit },
    layer: LayerRow,
    plan: ChangePlan,
    outcomes: readonly ServerChangeOutcome[],
    artifact: LayerArtifactInput | null,
  ): Promise<ChangeAnswer[]> {
    const { docId, layerName } = input;
    const ran = new Map(outcomes.map((outcome) => [outcome.opId, outcome]));
    const records = new Map<string, { reverse: string; captureKey: string | null }>();
    for (const outcome of outcomes) {
      if (outcome.status !== 'applied' || !outcome.record) continue;
      const { reverse, capture } = packChangeRecord(outcome.record);
      let captureKey: string | null = null;
      if (capture) {
        captureKey = this.nextCaptureKey(ctx, docId, layerName, outcome.opId);
        await this.requireStorage().put(captureKey, capture, { contentLength: capture.byteLength });
      }
      records.set(outcome.opId, { reverse, captureKey });
    }
    const nextVersion = layer.currentVersion + 1;
    let saved: { key: string; sha256: string; size: number } | null = null;
    if (artifact) {
      const key = this.nextArtifactKey(ctx, docId, layerName, nextVersion);
      saved = { key, ...(await this.uploadLayerArtifact(key, artifact)) };
    }
    const now = plan.now;
    const expiresAt = now + changeRetentionMs();

    const committed = await this.requireDb()
      .transaction()
      .execute(async (trx) => {
        let cacheDelta: CacheDelta | null = null;
        let advance: ((lastAuditId: number) => Promise<void>) | null = null;
        if (saved) {
          const facts = factsOf(
            outcomes.flatMap((outcome) =>
              outcome.status === 'applied' && wrote(outcome.result) ? [outcome.result] : [],
            ),
          );
          const bumped = await this.bumpChangeVersions(trx, layer, facts, now);
          cacheDelta = this.layerState.buildCacheDelta({
            docId,
            layerName,
            previousDocVersion: bumped.previousDocVersion,
            docVersion: bumped.versions.doc_version,
            ...(bumped.versions.annotations_version !== undefined
              ? { annotationsVersion: bumped.versions.annotations_version }
              : {}),
            ...(bumped.versions.forms_version !== undefined
              ? { formsVersion: bumped.versions.forms_version }
              : {}),
            pages: bumped.pages,
          });
          if (bumped.versions.metadata_version !== undefined) {
            cacheDelta = { ...cacheDelta, metadataVersion: bumped.versions.metadata_version };
          }
          const artifactFields = {
            layer,
            nextVersion,
            artifactKey: saved.key,
            artifactSha: saved.sha256,
            artifactSize: saved.size,
          };
          advance = async (lastAuditId) => {
            await this.writeLayerAdvance(trx, artifactFields, bumped.versions, lastAuditId, now);
            for (const page of bumped.pages) {
              await trx
                .updateTable('layer_pages')
                .set({
                  annotation_version: page.annotationVersion,
                  widget_version: page.widgetVersion,
                  updated_at: now,
                })
                .where('layer_id', '=', layer.id)
                .where('page_object_number', '=', page.pageObjectNumber)
                .execute();
            }
          };
        }

        const answers: ChangeAnswer[] = [];
        const rows: ChangeOutcomeRow[] = [];
        let lastAuditId = 0;
        for (const slot of plan.slots) {
          if (slot.kind === 'kept') {
            answers.push(slot.answer);
            continue;
          }
          const outcome = slot.kind === 'run' ? ran.get(slot.opId) : undefined;
          const error =
            slot.kind === 'refused'
              ? serializeError(slot.error)
              : outcome?.status === 'refused'
                ? outcome.error
                : null;
          if (error || !outcome || outcome.status !== 'applied') {
            const refusal = error ?? serializeError(new Error(`change ${slot.opId} ran no job`));
            answers.push({ opId: slot.opId, status: 'refused', error: refusal });
            if (slot.kind === 'run' || slot.keep) {
              rows.push(
                refusedRow(layer.id, slot.opId, slot.fingerprint, refusal, ctx.sub, now, expiresAt),
              );
            }
            continue;
          }
          const writes = wrote(outcome.result) && saved !== null;
          const result = withCacheDelta(outcome.result, writes ? cacheDelta : null);
          let auditId: number | null = null;
          if (writes && saved) {
            const pages = result.meta.affectedPages.map((page) => page.objectNumber);
            auditId =
              (await this.eventLog?.appendDb(
                trx,
                makeAuditEvent({
                  ctx,
                  docId,
                  layer,
                  layerName,
                  kind: input.single?.auditKind ?? 'change',
                  pageObjectNumber: input.single?.auditKind.startsWith('annot.')
                    ? (pages[0] ?? null)
                    : null,
                  affectedPages: pages,
                  artifactVersion: nextVersion,
                  artifactKey: saved.key,
                  artifactSha: saved.sha256,
                  artifactSize: saved.size,
                  idempotencyKey: slot.opId,
                  undoOf: slot.kind === 'run' ? slot.undoOf : null,
                  payload: input.single ? input.single.payloadOf(result) : result,
                  ts: now,
                }),
              )) ?? null;
            if (auditId) lastAuditId = Math.max(lastAuditId, auditId);
          }
          const record = records.get(slot.opId);
          answers.push({ opId: slot.opId, status: 'applied', result });
          rows.push({
            layerId: layer.id,
            opId: slot.opId,
            payloadHash: slot.fingerprint,
            status: 'applied',
            response: result,
            actor: ctx.sub,
            auditId,
            reverse: record?.reverse ?? null,
            captureKey: record?.captureKey ?? null,
            createdAt: now,
            expiresAt,
          });
        }
        if (advance) await advance(lastAuditId);
        const repo = new ChangeOutcomesRepo(trx);
        for (const row of rows) await repo.insert(row);
        return { answers, lastAuditId };
      })
      .catch((err: unknown) => {
        // Another replica committed one of these changes first (its audit
        // row or its answer holds the opId): rerun, and answer from its row.
        if (isUniqueViolation(err)) {
          throw new LayerFenceConflict('a change of this request was answered meanwhile');
        }
        throw err;
      });

    if (saved) {
      this.finishLayerCommit(ctx, docId, layerName, nextVersion, saved.key, committed.lastAuditId);
    }
    // The commit holds every capture now: the write's cleanup leaves them.
    const pending = this.pendingAttemptKeys.get(layerWriteKey(ctx, docId, layerName));
    for (const { captureKey } of records.values()) if (captureKey) pending?.delete(captureKey);
    return committed.answers;
  }

  /**
   * The version bumps a commit's facts call for, read inside its transaction:
   * the document version always; each touched page's pin of the family that
   * changed on it (`annotation_version`, `widget_version`); the annotation
   * list and the form when they changed; the metadata when it changed.
   */
  private async bumpChangeVersions(
    trx: Transaction<Schema>,
    layer: LayerRow,
    facts: ChangeFacts,
    now: number,
  ): Promise<{
    previousDocVersion: number;
    versions: {
      doc_version: number;
      annotations_version?: number;
      forms_version?: number;
      metadata_version?: number;
    };
    pages: DurablePageRow[];
  }> {
    const current = await trx
      .selectFrom('layers')
      .select(['doc_version', 'annotations_version', 'forms_version', 'metadata_version'])
      .where('id', '=', layer.id)
      .executeTakeFirst();
    if (!current) throw new EngineError(EngineErrorCode.NotFound, `layer not found: ${layer.id}`);
    const annotationPages = new Set(facts.annotationPages);
    const widgetPages = new Set(facts.widgetPages);
    const pages: DurablePageRow[] = [];
    for (const pageObjectNumber of new Set([...annotationPages, ...widgetPages])) {
      const page = await trx
        .selectFrom('layer_pages')
        .selectAll()
        .where('layer_id', '=', layer.id)
        .where('page_object_number', '=', pageObjectNumber)
        .executeTakeFirst();
      if (!page) {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `a change reported unknown page object number ${pageObjectNumber}`,
        );
      }
      pages.push({
        pageObjectNumber,
        contentVersion: Number(page.content_version),
        annotationVersion:
          Number(page.annotation_version) + (annotationPages.has(pageObjectNumber) ? 1 : 0),
        widgetVersion: Number(page.widget_version) + (widgetPages.has(pageObjectNumber) ? 1 : 0),
        updatedAt: now,
      });
    }
    const previousDocVersion = Number(current.doc_version);
    return {
      previousDocVersion,
      versions: {
        doc_version: previousDocVersion + 1,
        ...(facts.annotationList
          ? { annotations_version: Number(current.annotations_version ?? 1) + 1 }
          : {}),
        ...(facts.form ? { forms_version: Number(current.forms_version ?? 1) + 1 } : {}),
        ...(facts.metadata ? { metadata_version: Number(current.metadata_version) + 1 } : {}),
      },
      pages,
    };
  }

  /**
   * A single-op route's write as a one-change request: the same checks,
   * answer and record as `POST …/changes`, so its opId undoes it, and its
   * audit row keeps the route's kind and result.
   */
  private async applySingleOp<T>(
    ctx: LayerWriteContext,
    target: { docId: string; layerName: string },
    op: ChangeOp<PageCoordinates, WireAnnotationResources>,
    authority: ChangeAuthority,
    auditKind: AuditMutationKind,
    signal?: AbortSignal,
  ): Promise<T> {
    const [answer] = await this.applyChanges(
      ctx,
      {
        docId: target.docId,
        layerName: target.layerName,
        changes: [{ opId: writeOpIdOf(ctx), change: { ops: [op] } }],
        authority,
        single: { auditKind, payloadOf: verbResultOf },
      },
      signal,
    );
    if (!answer) throw new EngineError(EngineErrorCode.Unknown, `${op.type} gave no answer`);
    if (answer.status === 'refused') throw deserializeError(answer.error);
    return verbResultOf(answer.result) as T;
  }

  /**
   * A final change committed at audit row `auditId`: an undo naming a change
   * before it is refused (`final-change`), and the sweeper deletes their
   * captures.
   */
  private async endUndoAt(
    trx: Transaction<Schema>,
    layerId: string,
    auditId: number,
  ): Promise<void> {
    await trx
      .updateTable('layers')
      .set({ undo_horizon: auditId })
      .where('id', '=', layerId)
      .execute();
  }

  /** The answers kept on the layer for a request's changes and for the changes its undos name. */
  private async keptOutcomes(
    layerId: string,
    changes: readonly RequestedChange[],
  ): Promise<Map<string, ChangeOutcomeRow>> {
    const named = new Set<string>();
    for (const { opId, change } of changes) {
      named.add(opId);
      if (isUndoChange(change)) named.add(change.undoOf);
    }
    return new ChangeOutcomesRepo(this.requireDb()).findMany(layerId, [...named]);
  }

  /** The audit id of the layer's last final change: no change before it can be undone. */
  private async undoHorizonOf(layerId: string): Promise<number | null> {
    const row = await this.requireDb()
      .selectFrom('layers')
      .select('undo_horizon')
      .where('id', '=', layerId)
      .executeTakeFirst();
    return row?.undo_horizon === null || row?.undo_horizon === undefined
      ? null
      : Number(row.undo_horizon);
  }

  /** A change's capture blob, or null when it has none. */
  private async readCapture(captureKey: string | null): Promise<Uint8Array | null> {
    if (!captureKey) return null;
    const bytes = await this.requireStorage().get(captureKey);
    if (!bytes) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `a change's capture is missing: ${captureKey}`,
      );
    }
    return bytes;
  }

  /** A capture's key for this attempt, deleted unless the commit claims it. */
  private nextCaptureKey(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    opId: string,
  ): string {
    const attempt = randomUUID().replace(/-/g, '').slice(0, 8);
    const key = StorageKeys.changeCapture(ctx.tenantId, docId, layerName, opId, attempt);
    const writeKey = layerWriteKey(ctx, docId, layerName);
    const pending = this.pendingAttemptKeys.get(writeKey) ?? new Set<string>();
    pending.add(key);
    this.pendingAttemptKeys.set(writeKey, pending);
    return key;
  }

  // ── editing sessions ──────────────────────────────────────────────────────

  /**
   * `/access` for a client that may create: make, revive or keep alive its
   * editing session (`ctx.originSessionId` with the token's subject) and
   * hand it `wanted` numbers (`FIRST_OBJECT_NUMBERS` for a new session when
   * the client names no count). The layer becomes real here if it wasn't.
   */
  async openEditSession(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; wanted?: number },
  ): Promise<EditSessionAccess> {
    const objectNumbers = this.requireObjectNumbers();
    const layer = await this.prepareEditLayer(ctx, input.docId, input.layerName);
    const key = editSessionKey(ctx, layer.id);
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const touched = await objectNumbers.touchSession(trx, key);
        const wanted = Math.min(
          input.wanted ?? (touched.state === 'new' ? FIRST_OBJECT_NUMBERS : 0),
          MAX_OBJECT_NUMBER_TOP_UP,
        );
        const issued =
          wanted > 0 && this.takeIssueTurn(ctx) ? await objectNumbers.issue(trx, key, wanted) : [];
        return {
          session: touched.state,
          expiresIn: secondsOf(touched.expiresIn),
          objectNumbers: rangesOf(issued),
        };
      });
  }

  /**
   * `POST …/object-numbers`: hand the editing session `count` more numbers
   * (at most `MAX_OBJECT_NUMBER_RESERVATION`), for a large paste; a few more
   * when a reclaimed block covers them, since blocks move whole. Refused with
   * `LayerFull` when the layer has fewer to hand out.
   */
  async reserveObjectNumbers(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; count: number },
  ): Promise<{ objectNumbers: ObjectNumberRange[]; expiresIn: number }> {
    const objectNumbers = this.requireObjectNumbers();
    if (
      !Number.isInteger(input.count) ||
      input.count < 1 ||
      input.count > MAX_OBJECT_NUMBER_RESERVATION
    ) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `count must be 1 to ${MAX_OBJECT_NUMBER_RESERVATION}`,
        { details: { field: 'count' } },
      );
    }
    const layer = await this.prepareEditLayer(ctx, input.docId, input.layerName);
    const key = editSessionKey(ctx, layer.id);
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const touched = await objectNumbers.touchSession(trx, key);
        const issued = await objectNumbers.issue(trx, key, input.count);
        if (issued.length < input.count) {
          throw new EngineError(EngineErrorCode.LayerFull, 'no more object numbers to hand out');
        }
        return { objectNumbers: rangesOf(issued), expiresIn: secondsOf(touched.expiresIn) };
      });
  }

  /**
   * The event stream's view of an editing session, on connect and at each
   * heartbeat: `null` when the request's session doesn't exist (only
   * `/access` and writes make one). Otherwise it is kept alive, and a session
   * that may create and holds nothing (a publish dropped its numbers) gets
   * `FIRST_OBJECT_NUMBERS`.
   */
  async editSessionHeartbeat(
    ctx: LayerWriteContext,
    input: { docId: string; layerName: string; mayCreate: boolean },
  ): Promise<EditSessionStatus | null> {
    if (!this.objectNumbers || !this.db || !ctx.originSessionId) return null;
    const objectNumbers = this.objectNumbers;
    const layer = await this.layerState.repos.layers.findByDocAndName(input.docId, input.layerName);
    if (!layer || layer.tenantId !== ctx.tenantId) return null;
    const key = editSessionKey(ctx, layer.id);
    if (!(await objectNumbers.findSession(this.db, key))) return null;
    return this.db.transaction().execute(async (trx) => {
      const touched = await objectNumbers.touchSession(trx, key);
      let held = await objectNumbers.held(trx, key);
      if (
        held.length === 0 &&
        input.mayCreate &&
        (await objectNumbers.hasCounter(trx, layer.id)) &&
        this.takeIssueTurn(ctx)
      ) {
        await objectNumbers.issue(trx, key, FIRST_OBJECT_NUMBERS);
        held = await objectNumbers.held(trx, key);
      }
      return { held, expiresIn: secondsOf(touched.expiresIn) };
    });
  }

  /**
   * The layer an editing session hands numbers out on: real (its row made),
   * open on the engine, and with its counter started.
   */
  private async prepareEditLayer(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
  ): Promise<LayerRow> {
    const documentService = this.requireDocumentService();
    await documentService.getLayerManifest(ctx, docId, layerName);
    const { layer } = await this.materializeLayerForWrite(ctx, docId, layerName);
    await documentService.ensureLayerFreshOnPool(ctx, docId, layerName, layer.currentVersion);
    await this.startObjectCounter(layer);
    return layer;
  }

  /** Start the layer's counter the first time, past what the engine reported on opening it. */
  private async startObjectCounter(layer: LayerRow): Promise<void> {
    const objectNumbers = this.requireObjectNumbers();
    const db = this.requireDb();
    if (await objectNumbers.hasCounter(db, layer.id)) return;
    const last = this.requireDocumentService().lastObjectNumberAtOpen(layer.docId, layer.name);
    if (last === undefined) {
      throw new EngineError(EngineErrorCode.Unknown, `layer ${layer.id} is not open`);
    }
    await objectNumbers.startCounter(db, layer.id, last);
  }

  /**
   * Whether `ctx`'s token may be handed numbers now: one turn per request
   * that asks. Past its turns it is handed none, and the request still
   * succeeds.
   */
  private takeIssueTurn(ctx: LayerWriteContext): boolean {
    return this.issueTurns.consume(ctx.jwt?.jti ?? `${ctx.tenantId}:${ctx.sub}`) === 0;
  }

  private requireObjectNumbers(): ObjectNumberService {
    if (!this.objectNumbers) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        'this server hands out no object numbers',
      );
    }
    return this.objectNumbers;
  }

  /** A write's commit landed: the numbers it handed out go to the response. */
  private answerObjectNumbers(docId: string, layerName: string): void {
    for (const write of this.layerWrites.values()) {
      if (write.docId === docId && write.layerName === layerName) write.answer();
    }
  }

  /** The write wrapper's last step: the write's unsettled ranges go back. */
  private async releaseObjectNumbers(docId: string, layerName: string): Promise<void> {
    for (const [layerId, write] of this.layerWrites) {
      if (write.docId !== docId || write.layerName !== layerName) continue;
      this.layerWrites.delete(layerId);
      await write.release();
    }
  }

  /**
   * The commit of a write that changes the layout and keeps the page set: a
   * reorder, and a page name (`pages` empty: no page moved).
   */
  private async persistPageLayout(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    layer: LayerRow,
    input: {
      result: { layout: PageListSnapshot; meta: MutationMeta };
      /** The pages that moved, in their new order. */
      pages: PageRef[];
      artifact: LayerArtifactInput;
    },
  ): Promise<PageReorderResult> {
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
      kind: 'pages.reorder',
      pages: input.pages,
      layout: input.result.layout,
      stamp: input.result.meta,
      // Every page's position is touched by a reorder.
      affectedPages: input.result.layout.pages.map((page) => page.ref.objectNumber),
      artifactKey,
      artifactSha: uploaded.sha256,
      artifactSize: uploaded.size,
      nextVersion,
    });
    this.finishLayerCommit(ctx, docId, layerName, nextVersion, artifactKey, committed.auditId);
    return { ...committed.result, pages: input.pages };
  }

  /**
   * Rotate shares the reorder commit exactly (the corrected model: rotation is
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
      stamp: input.result.meta,
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
      result: RedactionApplyResult;
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
      stamp: input.result.meta,
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
      stamp: input.result.meta,
      insertedPages: input.result.insertedPages.map((page) => page.objectNumber),
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

  /**
   * Shared commit for the page-structure ops that keep the page set intact
   * (reorder + rotate). Both have the same shape: the layer's `doc_version` and
   * `layout_version` advance, `layer_pages` rows are left entirely untouched
   * (display order and rotation live in the artifact, read back via /layout),
   * and every per-page content/annotation cache stays warm.
   */
  private async commitPageStructure(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    kind: 'pages.reorder' | 'pages.rotate';
    /** A reorder's moved pages, in their new order: `result.pages`. */
    pages?: PageRef[];
    /** The worker's post-mutation layout — becomes `result.layout`. */
    layout: PageListSnapshot;
    /** The write's id and whether it can be undone, as the worker stamped them. */
    stamp: WriteStamp;
    affectedPages: PageObjectNumber[];
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
  }): Promise<{
    result: { pages?: PageRef[]; layout: PageListSnapshot; meta: MutationMeta };
    auditId: number;
  }> {
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const currentLayer = await this.readLayerForCommit(trx, input.layer);

        // The worker's layout is the new order; validate its page set against
        // the durable rows before trusting it.
        const pageOrder = input.layout.pages.map((page) => page.ref.objectNumber);
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
        const versions: LayoutVersions = {
          previousDocVersion,
          docVersion: previousDocVersion + 1,
          layoutVersion: Number(currentLayer.layout_version) + 1,
        };

        // The finalized result — audited and returned identically: what we
        // tell the caller is what we tell history (and remote subscribers).
        const result = {
          ...(input.pages ? { pages: input.pages } : {}),
          layout: input.layout,
          meta: planeMeta(input.stamp, versions),
        };

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
   * `layer_pages` rows. Surviving pages' rows are untouched, so their pins
   * stay warm.
   */
  private async commitPageDelete(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    /** The worker's post-delete layout (survivors) — becomes `result.layout`. */
    layout: PageListSnapshot;
    /** The write's id and whether it can be undone, as the worker stamped them. */
    stamp: WriteStamp;
    deletedPages: PageObjectNumber[];
    artifactKey: string;
    artifactSha: string;
    artifactSize: number;
    nextVersion: number;
  }): Promise<{
    result: { layout: PageListSnapshot; meta: MutationMeta };
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
        const survivorOrder = input.layout.pages.map((page) => page.ref.objectNumber);
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

        const previousDocVersion = Number(currentLayer.doc_version);
        const versions: LayoutVersions = {
          previousDocVersion,
          docVersion: previousDocVersion + 1,
          layoutVersion: Number(currentLayer.layout_version) + 1,
        };

        // The finalized result — audited and returned identically: what we
        // tell the caller is what we tell history (and remote subscribers).
        const result = { layout: input.layout, meta: planeMeta(input.stamp, versions) };

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
            // Clients re-pin via the 404-refresh rail (the layout delta
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
   * epoch (`content_version` 1, `annotation_version` 1 — exactly what the
   * base snapshot would have written had the pages always existed).
   * Pre-existing rows are untouched, so their pins stay warm.
   */
  private async commitPageInsert(input: {
    ctx: LayerWriteContext;
    docId: string;
    layerName: string;
    layer: LayerRow;
    kind: 'pages.insert' | 'pages.insertBlank';
    /** The worker's post-insert layout — becomes `result.layout`. */
    layout: PageListSnapshot;
    /** The write's id and whether it can be undone, as the worker stamped them. */
    stamp: WriteStamp;
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
        const pageOrder = input.layout.pages.map((page) => page.ref.objectNumber);
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
              widget_version: 1,
              updated_at: now,
            })),
          )
          .execute();

        const previousDocVersion = Number(currentLayer.doc_version);
        const versions: LayoutVersions = {
          previousDocVersion,
          docVersion: previousDocVersion + 1,
          layoutVersion: Number(currentLayer.layout_version) + 1,
        };

        // The finalized result — audited and returned identically: what we
        // tell the caller is what we tell history (and remote subscribers).
        const result: PageInsertResult = {
          insertedPages: input.insertedPages.map(toPageRef),
          layout: input.layout,
          meta: planeMeta(input.stamp, versions),
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
            // The page set grew — the annotation list and the form changed.
            // Clients re-pin via the 404-refresh rail (the layout delta
            // carries neither pin).
            annotations_version: Number(currentLayer.annotations_version ?? 1) + 1,
            forms_version: Number(currentLayer.forms_version ?? 1) + 1,
          },
          auditId,
          now,
        );

        return { result, auditId };
      });
  }

  /**
   * Flatten commit: the page registry/layout stays intact, while every page
   * whose native outcome may have changed advances both cache planes.
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
        const affected = input.raw.meta.affectedPages.map((page) => page.objectNumber);
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
          nextPages.push({
            pageObjectNumber,
            contentVersion: Number(row.content_version) + 1,
            annotationVersion: Number(row.annotation_version) + 1,
            widgetVersion: Number(row.widget_version) + 1,
            updatedAt: now,
          });
        }

        const previousLayerDocVersion = Number(currentLayer.doc_version);
        // Flatten bakes annotations and form fields into content — both
        // lists change.
        const annotationsVersion = Number(currentLayer.annotations_version ?? 1) + 1;
        const formsVersion = Number(currentLayer.forms_version ?? 1) + 1;
        const durable: CommittedPageFlatten = {
          pages: nextPages,
          previousLayerDocVersion,
          layerDocVersion: previousLayerDocVersion + 1,
        };
        const result: T = {
          ...input.raw,
          meta: {
            ...input.raw.meta,
            cacheDelta: this.layerState.buildCacheDelta({
              docId: input.docId,
              layerName: input.layerName,
              previousDocVersion: durable.previousLayerDocVersion,
              docVersion: durable.layerDocVersion,
              annotationsVersion,
              formsVersion,
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
        // A final change: no change before it can be undone any more.
        await this.endUndoAt(trx, input.layer.id, auditId);

        await this.writeLayerAdvance(
          trx,
          input,
          {
            doc_version: durable.layerDocVersion,
            annotations_version: annotationsVersion,
            forms_version: formsVersion,
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
              widget_version: page.widgetVersion,
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
   * An import's commit: every page it touched advances its annotation
   * version, the layer's `doc_version` and bulk annotations pin once, and one audit row holds the finalized result
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
  }): Promise<{ result: AnnotationImportResult; auditId: number }> {
    return this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const now = Date.now();
        const currentLayer = await this.readLayerForCommit(trx, input.layer);
        const affected = input.raw.meta.affectedPages.map((page) => page.objectNumber);

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
          nextPages.push({
            pageObjectNumber,
            contentVersion: Number(row.content_version),
            annotationVersion: Number(row.annotation_version) + 1,
            widgetVersion: Number(row.widget_version),
            updatedAt: now,
          });
        }

        const previousLayerDocVersion = Number(currentLayer.doc_version);
        const layerDocVersion = previousLayerDocVersion + 1;
        const annotationsVersion = Number(currentLayer.annotations_version ?? 1) + 1;
        const result: AnnotationImportResult = {
          ...input.raw,
          meta: {
            ...input.raw.meta,
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
              widget_version: page.widgetVersion,
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
    raw: RedactionApplyResult;
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
        const affected = input.raw.meta.affectedPages.map((page) => page.objectNumber);
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
          nextPages.push({
            pageObjectNumber,
            contentVersion: Number(row.content_version) + 1,
            annotationVersion: Number(row.annotation_version) + 1,
            widgetVersion: Number(row.widget_version) + 1,
            updatedAt: now,
          });
        }

        const previousLayerDocVersion = Number(currentLayer.doc_version);
        const layerDocVersion = previousLayerDocVersion + 1;
        // Redaction consumes the marks and removes what it covers, form
        // fields included — both lists change.
        const annotationsVersion = Number(currentLayer.annotations_version ?? 1) + 1;
        const formsVersion = Number(currentLayer.forms_version ?? 1) + 1;
        const result: RedactionApplyResult = {
          ...input.raw,
          meta: {
            ...input.raw.meta,
            cacheDelta: this.layerState.buildCacheDelta({
              docId: input.docId,
              layerName: input.layerName,
              previousDocVersion: previousLayerDocVersion,
              docVersion: layerDocVersion,
              annotationsVersion,
              formsVersion,
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
        // A final change: no change before it can be undone any more.
        await this.endUndoAt(trx, input.layer.id, auditId);

        await this.writeLayerAdvance(
          trx,
          input,
          {
            doc_version: layerDocVersion,
            annotations_version: annotationsVersion,
            forms_version: formsVersion,
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
              widget_version: page.widgetVersion,
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
    forms_version: number | bigint;
  }> {
    // Plain read — values feed the next-version computation. The fence is
    // the guarded UPDATE (see guardedVersionBump), never a SELECT check.
    const currentLayer = await trx
      .selectFrom('layers')
      .select([
        'current_version',
        'doc_version',
        'layout_version',
        'annotations_version',
        'forms_version',
      ])
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
            effect: 'snapshot' as const,
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
        let auditId = 0;
        try {
          await this.requireDb()
            .transaction()
            .execute(async (trx) => {
              await this.guardedVersionBump(trx, layer, {
                current_version: nextVersion,
                doc_version: layer.docVersion + 1,
                updated_at: now,
              });
              // Other sessions learn the layer is locked for signing.
              auditId = await this.appendSigningAudit(trx, ctx, {
                docId: input.docId,
                layer,
                layerName: input.layerName,
                kind: 'signature.prepare',
                artifactVersion: nextVersion,
                payload: { field: input.input.field, ...encodePrepared(answer) },
                ts: now,
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
        this.publishMutation(ctx, input.docId, auditId);
        return answer;
      } finally {
        // The worker's parked copy is redundant now (its tail is durable),
        // or useless after a failure: release it and its file.
        await this.requirePool()
          .run(input.docId, (jobId: WorkerJobId) =>
            wirePack({
              kind: 'signatures.cancel' as const,
              effect: 'session' as const,
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
      // A cancelled signing is gone, as locally; only the time limit expires one.
      if (signing.state === 'aborted') {
        throw new EngineError(EngineErrorCode.NotFound, `no signing '${input.signingId}'`);
      }
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
        profile: profileFor(prepared.subFilter),
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
                    effect: 'read' as const,
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

            // 5. Sessions over the old base are garbage, here and everywhere;
            //    the new version's protection is the signing's own.
            documentService.rememberProtection(
              committed.result.version.sha256,
              committed.result.protection,
            );
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
    const layer = await this.layerState.repos.layers.findByDocAndName(input.docId, input.layerName);
    const auditId = await this.discardSigning(signing, (trx) =>
      layer
        ? this.appendSigningAudit(trx, ctx, {
            docId: input.docId,
            layer,
            layerName: input.layerName,
            kind: 'signature.cancel',
            artifactVersion: layer.currentVersion,
            payload: { signingId: signing.id, status: 'cancelled' },
            ts: Date.now(),
          })
        : Promise.resolve(0),
    );
    // Other sessions learn the layer is free again.
    this.publishMutation(ctx, input.docId, auditId);
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

  /**
   * The sweep tick for changes: answers past their retention go, with their
   * captures; captures below a layer's undo horizon go, their answers kept.
   * Each pass takes at most `batch` of each.
   */
  async sweepChanges(now = Date.now(), batch = 500): Promise<number> {
    if (!this.db) return 0;
    const repo = new ChangeOutcomesRepo(this.db);
    const deleteCaptures = (rows: readonly ChangeOutcomeRow[]) =>
      Promise.all(
        rows.flatMap((row) =>
          row.captureKey
            ? [
                this.requireStorage()
                  .delete(row.captureKey)
                  .catch(() => undefined),
              ]
            : [],
        ),
      );
    const byLayer = (rows: readonly ChangeOutcomeRow[]) => {
      const layers = new Map<string, string[]>();
      for (const row of rows)
        layers.set(row.layerId, [...(layers.get(row.layerId) ?? []), row.opId]);
      return layers;
    };
    const expired = await repo.findExpired(now, batch);
    await deleteCaptures(expired);
    for (const [layerId, opIds] of byLayer(expired)) await repo.delete(layerId, opIds);
    const ended = await repo.findBelowHorizon(batch);
    await deleteCaptures(ended);
    for (const [layerId, opIds] of byLayer(ended)) await repo.clearRecords(layerId, opIds);
    return expired.length + ended.length;
  }

  /** Newest first; the versions listing joins these to the catalog. */
  async listSignings(ctx: LayerWriteContext, docId: string): Promise<SigningRow[]> {
    const signings = this.requireSignings();
    return (await signings.listForDocument(docId)).filter((s) => s.tenantId === ctx.tenantId);
  }

  /**
   * Move a prepared signing to `aborted` and drop its tail. `audit` runs in
   * the same transaction when the move wins; its row id is returned (0 when
   * the signing had already moved).
   */
  private async discardSigning(
    signing: SigningRow,
    audit?: (trx: Transaction<Schema>) => Promise<number>,
  ): Promise<number> {
    const auditId = await this.requireDb()
      .transaction()
      .execute(async (trx) => {
        const moved = await this.requireSignings().transition(
          trx,
          signing.id,
          'prepared',
          'aborted',
          { finishedAt: Date.now() },
        );
        if (!moved) return -1;
        return audit ? await audit(trx) : 0;
      });
    if (auditId < 0) return 0;
    await this.requireStorage()
      .delete(signing.tailKey)
      .catch(() => undefined);
    return auditId;
  }

  /**
   * The audit row of a signing step that writes no layer artifact (prepare,
   * cancel): it names the layer's current artifact, and advances the
   * layer's audit head so the manifest's cursor includes it.
   */
  private async appendSigningAudit(
    trx: Transaction<Schema>,
    ctx: LayerWriteContext,
    input: {
      docId: string;
      layer: LayerRow;
      layerName: string;
      kind: 'signature.prepare' | 'signature.cancel';
      artifactVersion: number;
      payload: unknown;
      ts: number;
    },
  ): Promise<number> {
    const auditEvent = makeAuditEvent({
      ctx,
      docId: input.docId,
      layer: input.layer,
      layerName: input.layerName,
      kind: input.kind,
      pageObjectNumber: null,
      affectedPages: [],
      artifactVersion: input.artifactVersion,
      artifactKey: input.layer.currentArtifactKey ?? '',
      artifactSha: input.layer.currentArtifactSha ?? '',
      artifactSize: input.layer.currentArtifactSize ?? 0,
      // A signing answers a retry by the signing itself.
      idempotencyKey: null,
      payload: input.payload,
      ts: input.ts,
    });
    const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;
    if (auditId > 0) {
      await trx
        .updateTable('layers')
        .set({ last_audit_id: auditId })
        .where('id', '=', input.layer.id)
        .execute();
    }
    return auditId;
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
        wirePack({
          kind: 'signatures.list' as const,
          effect: 'read' as const,
          jobId,
          docId,
          layerName,
        }),
      signal,
    );
    if (payload.tag !== 'signatures.list') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload: ${payload.tag}`);
    }
    const match = payload.snapshot.signatures.find((s) =>
      field.kind === 'objectNumber'
        ? s.field.kind === 'objectNumber' && s.field.objectNumber === field.objectNumber
        : s.fieldName === field.name,
    );
    if (!match || match.field.kind !== 'objectNumber') {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no signature field ${field.kind === 'fqn' ? `'${field.name}'` : `#${field.objectNumber}`}`,
      );
    }
    return match.field.objectNumber;
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
        /** The new version's last object number. */
        lastObjectNumber: number;
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
        const widgetPage = finalized.signature.widget?.page?.objectNumber ?? null;

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
          if (!current || current.state === 'aborted') {
            throw new EngineError(EngineErrorCode.NotFound, `no signing '${signing.id}'`);
          }
          throw new EngineError(
            EngineErrorCode.SigningExpired,
            `signing '${signing.id}' is ${current.state}`,
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
            // The signed field reads differently in the new version: its
            // form gets a pin of its own, which the layer inherits.
            forms_version: layer.formsVersion + 1,
            updated_at: now,
          },
        );
        // The new version numbers its objects anew: every number handed out
        // on the layer is dropped, and new ones start past the version's.
        await this.objectNumbers?.publish(trx, layer.id, finalized.lastObjectNumber);

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
          formsVersion: layer.formsVersion + 1,
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
            affectedPages: promoted.map((page) => toPageRef(page.pageObjectNumber)),
            // No delta: a publish changes more of the manifest than a delta
            // carries; the client refreshes its manifest on completion.
            cacheDelta: null,
            // Signing is final: it ends undo for every write before it.
            opId: writeOpIdOf(ctx),
            undoable: false,
          },
        };
        const auditEvent = makeAuditEvent({
          ctx,
          docId: input.docId,
          layer,
          layerName: input.layerName,
          kind: 'signature.complete',
          pageObjectNumber: widgetPage,
          affectedPages: widgetPage !== null ? [widgetPage] : [],
          artifactVersion: nextVersion,
          artifactKey: input.versionKey,
          artifactSha: finalized.version.sha256,
          artifactSize: finalized.version.byteLength,
          // A signing answers a retry by the signing itself.
          idempotencyKey: null,
          // The event names the signing, as the local engine's does.
          payload: { signingId: signing.id, ...result },
          ts: now,
        });
        const auditId = (await this.eventLog?.appendDb(trx, auditEvent)) ?? 0;
        // A final change: no change before it can be undone any more.
        await this.endUndoAt(trx, layer.id, auditId);
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
    // The write's object numbers commit with it (see LayerWriteObjectNumbers).
    const write = this.layerWrites.get(layer.id);
    if (write && (await write.commit(trx)) === 'overran') {
      throw new LayerFenceConflict(
        `the write's objects on ${layer.id} passed object numbers handed out meanwhile`,
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
      forms_version?: number;
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
          meta: {
            ...input.result.meta,
            ...planeMeta(input.result.meta, { previousDocVersion, docVersion, attachmentsVersion }),
          },
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
        return await this.attemptOrReplay(ctx, docId, layerName, op);
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
        return await this.attemptOrReplay(ctx, docId, layerName, op);
      }
    } catch (err) {
      documentService.invalidateLayerSession(docId, layerName);
      throw err;
    } finally {
      settle();
      await this.releaseObjectNumbers(docId, layerName);
      // Attempt-artifact hygiene: any upload whose commit did not win is
      // unreachable garbage (unique per-attempt keys). Best-effort, awaited
      // so a caller observing the response never sees the orphan; crash
      // windows are the orphan sweeper's job.
      await this.cleanupPendingAttempts(ctx, docId, layerName);
    }
  }

  /**
   * One attempt of a queued write. A request whose `Idempotency-Key`
   * already committed gets what it committed instead: found before the
   * write runs again (`prepareLayerMutation`), or after this attempt
   * failed, since the same request may have committed on another replica
   * meanwhile (its commit won, or it spent the numbers this attempt
   * checked).
   */
  private async attemptOrReplay<T>(
    ctx: LayerWriteContext,
    docId: string,
    layerName: string,
    op: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await op();
      this.answerObjectNumbers(docId, layerName);
      return result;
    } catch (err) {
      if (err instanceof CommittedWrite) return err.payload as T;
      if (!ctx.idempotencyKey) throw err;
      const layer = await this.layerState.repos.layers.findByDocAndName(docId, layerName);
      const committed = layer ? await this.committedWrite(layer.id, ctx.idempotencyKey) : null;
      if (!committed) throw err;
      // This attempt's change never landed: the session drops it.
      this.requireDocumentService().invalidateLayerSession(docId, layerName);
      return committed.payload as T;
    }
  }

  /** What a write committed under `idempotencyKey` on the layer, if one did. */
  private async committedWrite(
    layerId: string,
    idempotencyKey: string | undefined,
  ): Promise<CommittedWrite | null> {
    if (!idempotencyKey) return null;
    const row = await new AuditLogRepo(this.requireDb()).findByIdempotencyKey(
      layerId,
      idempotencyKey,
    );
    return row ? new CommittedWrite(row.payload) : null;
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
  /**
   * The key a retry finds this row by: the request's `Idempotency-Key`
   * unless given. A row whose payload isn't the response stores none.
   */
  idempotencyKey?: string | null;
  /** An undo's row: the change it undid. */
  undoOf?: string | null;
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
    idempotencyKey:
      input.idempotencyKey === undefined
        ? (input.ctx.idempotencyKey ?? null)
        : input.idempotencyKey,
    undoOf: input.undoOf ?? null,
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
 * The pages a widget change report touched. A widget stored as a direct
 * object has no page (`page === null`) and is skipped.
 */
function widgetPages(widgets: ReadonlyArray<FormWidget>): PageObjectNumber[] {
  return widgets.flatMap((widget) => (widget.page === null ? [] : [widget.page.objectNumber]));
}

/** One key grammar for everything scoped to a layer's write pipeline. */
function layerWriteKey(ctx: LayerWriteContext, docId: string, layerName: string): string {
  return `${ctx.tenantId}::${docId}::${layerName}`;
}

/** Every page: the conservative answer for document-wide form ops (import, repair). */
function allPages(materialized: MaterializedLayer): PageObjectNumber[] {
  return materialized.pages.map((page) => page.pageObjectNumber);
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

/** The version bumps of a page-structure write. */
interface LayoutVersions {
  previousDocVersion: number;
  docVersion: number;
  layoutVersion: number;
}

/**
 * The `meta` of a write that moves a document-level plane pin (layout,
 * metadata, attachments) and no page pin: the client absorbs it from
 * `meta.cacheDelta`.
 */
function planeMeta(stamp: WriteStamp, delta: Omit<CacheDelta, 'pages'>): MutationMeta {
  return {
    affectedPages: [],
    cacheDelta: { ...delta, pages: [] },
    opId: stamp.opId,
    undoable: stamp.undoable,
  };
}

/** A write's id and whether it can be undone, as its worker job stamped them. */
type WriteStamp = Pick<MutationMeta, 'opId' | 'undoable'>;
