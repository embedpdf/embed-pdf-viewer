import type { AnnotationList } from '../annotation/AnnotationList';
import type { AnnotationDraft, AnnotationPatch } from '../annotation/kinds';
import type { WireAnnotationResources } from '../annotation/resources';
import type { AnnotationActor, AnnotationAuthority, ChangeAuthority } from '../auth/scope';
import type {
  AnnotationAppearanceMode,
  AnnotationAppearanceRenderOptions,
  AnnotationAppearancesResult,
} from '../dto/AnnotationRender';
import type { Attachment, AttachmentRef, WireAttachmentFile } from '../dto/Attachment';
import type { CustomMetadata } from '../dto/CustomMetadata';
import type { CustomMetadataPatch } from '../dto/CustomMetadataPatch';
import type { DocumentMetadata } from '../dto/DocumentMetadata';
import type { FontIdentityInfo } from '../dto/FontSpec';
import type { PdfMeasure, PageMeasurementViewport } from '../dto/Measure';
import type { MetadataPatch } from '../dto/MetadataPatch';
import type { PageGeometrySnapshot } from '../dto/PageGeometrySnapshot';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { PageNetworkRenderFormat, PageRaster, PageRenderOptions } from '../dto/PageRender';
import type { PageTextSnapshot } from '../dto/PageTextSnapshot';
import type { DocumentActionsSnapshot } from '../dto/PdfAction';
import type { PdfSaveMode } from '../dto/PdfSaveMode';
import type { PieceInfoPatch, PieceInfoSnapshot } from '../dto/PieceInfo';
import type { PieceInfoDeleteResult, PieceInfoUpdateResult } from '../engine/PieceInfoService';
import type { SerializedEngineError } from '../errors/EngineError';
import type { FormFieldDraft, WidgetPlacement } from '../forms/draft';
import type { FormEffect, FormEffectsResult } from '../forms/effects';
import type { FormFieldPatch } from '../forms/patch';
import type { FormSnapshot } from '../forms/snapshot';
import type { FormDataFormat, FormFieldValue } from '../forms/value';
import type { PdfRect, PdfRotation, PdfSize } from '../geometry/primitives';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { FormFieldRef, FormWidget } from '../identity/FormFieldRef';
import type { ObjectNumberRange } from '../identity/ObjectNumbers';
import type { PageRef } from '../identity/PageRef';
import type { AnnotationFlattenResult } from '../mutation/AnnotationFlattenResult';
import type { Change, ChangeResult } from '../mutation/Change';
import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationMoveResult,
  AnnotationUpdateResult,
} from '../mutation/AnnotationMutationResults';
import type {
  AttachmentCreateResult,
  AttachmentDeleteResult,
} from '../mutation/AttachmentMutationResults';
import type { CustomMetadataUpdateResult } from '../mutation/CustomMetadataUpdateResult';
import type {
  FormFieldCreateResult,
  FormFieldDeleteResult,
  FormFieldUpdateResult,
  FormImportResult,
  FormRepairResult,
  FormResetResult,
  FormSetValueResult,
  FormWidgetLinkResult,
} from '../mutation/FormMutationResults';
import type { MetadataUpdateResult } from '../mutation/MetadataUpdateResult';
import type { PageDeleteResult } from '../mutation/PageDeleteResult';
import type { PageFlattenResult, PageFlattenUsage } from '../mutation/PageFlattenResult';
import type { PageInsertResult } from '../mutation/PageInsertResult';
import type { PageMoveResult } from '../mutation/PageMoveResult';
import type { PageNameResult } from '../mutation/PageNameResult';
import type { PageRotateResult } from '../mutation/PageRotateResult';
import type { PageScaleResult } from '../mutation/PageScaleResult';
import type { RedactionApplyResult, RedactionApplyScope } from '../mutation/RedactionApplyResult';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';
import type { WireResourceMap } from '../resource/BinarySource';
import type { WorkingSetPage } from '../scheduling/facts';
import type { SearchRequest, SearchSlice } from '../search/types';
import type { AnalyzeInput, ChangeAnalysis } from '../signature/analysis/types';
import type {
  BaseVersionInfo,
  DigestAlgorithm,
  DocumentProtection,
  SignatureCancelResult,
  SignatureCompleteInput,
  SignatureCompleteResult,
  SignatureDTO,
  SignaturePrepareInput,
  SignaturePrepared,
  SignatureSnapshot,
  SignedDocumentPolicy,
} from '../signature/types';
import type { WireAnnotationBundle } from '../transfer/AnnotationBundle';
import type { AnnotationImportPages, AnnotationImportResult } from '../transfer/annotationImport';
import type { AnnotationBundleLimits } from '../transfer/bundleLimits';
import type { AnnotationExportSelection } from '../transfer/exportSelection';

/**
 * Wire protocol used between an Engine-side queue and any Worker host
 * (browser Web Worker, Node worker_thread, inline). Cloud HTTP traffic
 * uses a different envelope; this is purely the worker boundary.
 *
 * Identical between @embedpdf/engine and @cloudpdf/server because
 * the WorkerHost dispatch logic is the same on both sides — only the
 * underlying PdfRuntimeModule (WASM vs native) differs.
 */
export type WorkerJobId = number;

/**
 * What a job does to its document: part of every job request's definition,
 * so the one fact has one home. The worker queue keeps each document's jobs
 * in the order this asks for (the page residency plan, §10.5), and the worker
 * closes parsed pages a write may have changed.
 *
 * - `read`: changes nothing. It sees every write asked before it, and may see
 *   one asked after it.
 * - `snapshot`: reads the document as of its call, so writes asked after it
 *   wait for it (saving, exporting, preparing a signing).
 * - `session`: changes the session, not the document, so writes asked after it
 *   wait for it (font settings, cancelling a signing). Reads don't.
 * - `write`: changes the document, but no page's content (annotations, forms,
 *   metadata, attachments, names).
 * - `contentWrite`: may change what pages show (page edits, flattening,
 *   redaction, a completed signing).
 * - `runtimeWrite`: changes the runtime, for every document (fonts).
 * - `open`: opens the document, or unlocks it; everything after it waits.
 * - `close`: closes the document, or one layer of it, after everything before it.
 */
export type RequestEffect =
  | 'read'
  | 'snapshot'
  | 'session'
  | 'write'
  | 'contentWrite'
  | 'runtimeWrite'
  | 'open'
  | 'close';

/** What every document write request may carry besides its own fields. */
export interface WriteJobFields {
  /**
   * The write's id (`WriteOptions.opId`, or the one minted for it). The
   * worker answers a second job with the same id from the first one's
   * outcome, and keys what undoing the write needs under it.
   */
  opId: string;
  /**
   * The first object number the objects the write makes for itself may take
   * (appearance streams, fonts). The worker raises the layer's last object
   * number to just below it before the write runs. A caller that hands
   * object numbers to editing sessions keeps them all below it, so the
   * write's own objects never land on one.
   */
  objectNumberFloor?: number;
}

export interface OpenFatMemoryWorkerRequest {
  kind: 'open.fatMem';
  effect: 'open';
  jobId: WorkerJobId;
  docId: string;
  bytes: ArrayBuffer;
  password: string | null;
  /** Default `protect`. */
  signedDocumentPolicy?: SignedDocumentPolicy;
  /**
   * Who decides which object numbers a create may name. `'session'` (the
   * default) hands numbers out itself (`objectNumbers.reserve`, and
   * `reserveObjectNumbers` here) and refuses a create naming one it doesn't
   * hold. `'caller'` trusts the caller, which checked every number before
   * sending the job (a server that hands numbers to editing sessions).
   */
  objectNumbers?: 'session' | 'caller';
  /** Object numbers to hand this session as it opens (`'session'` only); the result has them. */
  reserveObjectNumbers?: number;
}

export type LayerOpenSource =
  | { kind: 'fresh' }
  | { kind: 'raw-delta'; bytes: ArrayBuffer }
  | { kind: 'artifact'; bytes: ArrayBuffer }
  | { kind: 'artifact-file'; path: string };

export interface OpenLayerMemoryBaseWorkerRequest {
  kind: 'open.layerMemBase';
  effect: 'open';
  jobId: WorkerJobId;
  docId: string;
  /**
   * Omit for a handle whose docId already uniquely identifies the layer
   * session. Cloud layer sessions supply a real layer name when multiple
   * layer views must live under one docId.
   */
  layerName?: string;
  baseKey: string;
  baseBytes: ArrayBuffer;
  layer: LayerOpenSource;
  password: string | null;
  signedDocumentPolicy?: SignedDocumentPolicy;
  /**
   * SHA-256 (hex) of the base bytes, when the caller already holds a
   * verified one. Saves the runtime a full pass over the file; an identity
   * claim only (a wrong value breaks the caller's own layer artifacts).
   */
  baseSha256?: string;
  /**
   * Who decides which object numbers a create may name. `'session'` (the
   * default) hands numbers out itself (`objectNumbers.reserve`, and
   * `reserveObjectNumbers` here) and refuses a create naming one it doesn't
   * hold. `'caller'` trusts the caller, which checked every number before
   * sending the job (a server that hands numbers to editing sessions).
   */
  objectNumbers?: 'session' | 'caller';
  /** Object numbers to hand this session as it opens (`'session'` only); the result has them. */
  reserveObjectNumbers?: number;
}

export interface OpenLayerFileBaseWorkerRequest {
  kind: 'open.layerFileBase';
  effect: 'open';
  jobId: WorkerJobId;
  docId: string;
  /**
   * Omit for the base-view session. Supplying a name opens a separate
   * layer session under the same docId.
   */
  layerName?: string;
  baseKey: string;
  basePath: string;
  layer: LayerOpenSource;
  password: string | null;
  signedDocumentPolicy?: SignedDocumentPolicy;
  /** See `OpenLayerMemoryBaseWorkerRequest.baseSha256`. */
  baseSha256?: string;
  /**
   * Who decides which object numbers a create may name. `'session'` (the
   * default) hands numbers out itself (`objectNumbers.reserve`, and
   * `reserveObjectNumbers` here) and refuses a create naming one it doesn't
   * hold. `'caller'` trusts the caller, which checked every number before
   * sending the job (a server that hands numbers to editing sessions).
   */
  objectNumbers?: 'session' | 'caller';
  /** Object numbers to hand this session as it opens (`'session'` only); the result has them. */
  reserveObjectNumbers?: number;
}

export type OpenWorkerRequest =
  | OpenFatMemoryWorkerRequest
  | OpenLayerMemoryBaseWorkerRequest
  | OpenLayerFileBaseWorkerRequest;

// ---------------------------------------------------------------------------
// Digital signatures (read side) and the saved version.
// ---------------------------------------------------------------------------

export interface SignaturesListWorkerRequest {
  kind: 'signatures.list';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  /**
   * Read the session's working copy (its unsaved state as one more revision
   * over the loaded bytes) instead of the loaded bytes. The cloud server
   * sets it: its layer sessions keep every committed edit in memory, so the
   * layer's durable state is the working copy. No-op without unsaved edits.
   */
  workingCopy?: boolean;
}

export interface SignaturesContentsWorkerRequest {
  kind: 'signatures.contents';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
}

export interface SignaturesDigestWorkerRequest {
  kind: 'signatures.digest';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  algorithm: DigestAlgorithm;
}

export interface SignaturesRevisionBytesWorkerRequest {
  kind: 'signatures.revisionBytes';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  revisionIndex: number;
}

export interface DocumentVersionWorkerRequest {
  kind: 'document.version';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
}

export interface SignaturesPrepareWorkerRequest {
  kind: 'signatures.prepare';
  effect: 'snapshot';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  input: SignaturePrepareInput;
}

export interface SignaturesCompleteWorkerRequest extends WriteJobFields {
  kind: 'signatures.complete';
  effect: 'contentWrite';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  input: SignatureCompleteInput;
  artifactPath?: string;
}

export interface SignaturesCancelWorkerRequest {
  kind: 'signatures.cancel';
  effect: 'session';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  signingId: string;
}

export interface SignaturesAnalyzeWorkerRequest {
  kind: 'signatures.analyze';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  input: AnalyzeInput;
}

/**
 * Session-less: install a CMS into a signing candidate file and verify the
 * result. The server rebuilds the candidate (base ⊕ durable tail) on
 * whichever replica completes the signing, so this never addresses a
 * session: the file is patched in place, opened into a transient session
 * for the checks, and closed. The caller keeps the sealed file.
 */
export interface SignaturesFinalizeCandidateWorkerRequest {
  kind: 'signatures.finalizeCandidate';
  effect: 'read';
  jobId: WorkerJobId;
  /** The candidate on the worker's filesystem; its /Contents hole is patched in place. */
  path: string;
  /** The /ByteRange the prepare reported — the fence every check is made against. */
  byteRange: [number, number, number, number];
  /** The reserved /Contents size the prepare reported (the hole holds twice as many hex digits). */
  contentsSize: number;
  fieldObjectNumber: number;
  /** The detached CMS over the prepared digest. */
  cms: ArrayBuffer;
  password?: string | null;
}

export interface MetadataReadWorkerRequest {
  kind: 'metadata.read';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
}

export interface MetadataUpdateWorkerRequest extends WriteJobFields {
  kind: 'metadata.update';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  patch: MetadataPatch;
  artifactPath?: string;
}

export interface MetadataReadCustomWorkerRequest {
  kind: 'metadata.readCustom';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
}

export interface MetadataUpdateCustomWorkerRequest extends WriteJobFields {
  kind: 'metadata.updateCustom';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  patch: CustomMetadataPatch;
  artifactPath?: string;
}

export interface ActionsReadWorkerRequest {
  kind: 'actions.read';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
}

/**
 * The annotations of the given pages, or of every page: a raw read off the
 * document (no page is loaded), one snapshot per page.
 */
export interface AnnotationsListWorkerRequest {
  kind: 'annotations.list';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  /** In the order to list them; every page when omitted. */
  pages?: PageRef[];
}

/**
 * Batch-render every annotation appearance stream on a page. Acquires a
 * `pagePtr`, iterates `/Annots`, and renders each annotation's `/AP` via
 * `EPDF_RenderAnnotBitmap` into its own raster. Read-only; gated on the
 * render capability like `pages.render`.
 */
export interface AnnotationsRenderAppearancesWorkerRequest {
  kind: 'annotations.renderAppearances';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  options?: AnnotationAppearanceRenderOptions;
}

export interface AnnotationsCreateWorkerRequest<
  C extends Coordinates = PageCoordinates,
> extends WriteJobFields {
  kind: 'annotations.create';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  draft: AnnotationDraft<C>;
  /** The object number the annotation gets; the next free one when absent. */
  objectNumber?: number;
  /**
   * The bytes beside the draft, by role. The producer puts each buffer on
   * the wirePack transfer list (zero-copy, same convention as `PageRaster`).
   */
  resources?: WireAnnotationResources;
  artifactPath?: string;
  /**
   * Identity to stamp on the newly created annotation:
   *   - `displayName` → /T (PDF author field)
   *   - `userId` / `groupId` → /EMBD_Metadata/{UserID,GroupID,CreatedBy,UpdatedBy}
   * Optional — when absent (engine-local with no identity, anonymous tests),
   * the worker still stamps the standard /M (modification date) but skips
   * EMBD_Metadata.
   */
  actor?: AnnotationActor;
}

export interface AnnotationsUpdateWorkerRequest<
  C extends Coordinates = PageCoordinates,
> extends WriteJobFields {
  kind: 'annotations.update';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: AnnotationRef;
  patch: AnnotationPatch<C>;
  /** The bytes beside the patch, by role — see the create request. */
  resources?: WireAnnotationResources;
  artifactPath?: string;
  /**
   * Who the update acts for and what they may do, checked against the
   * annotation inside the write. Its identity refreshes
   * /EMBD_Metadata/UpdatedBy; UserID, GroupID and CreatedBy stay unless the
   * patch reassigns the group.
   */
  authority: AnnotationAuthority;
}

/**
 * One change (`doc.apply`): its ops in order, as one transaction, or the
 * reverse of an earlier write (`{ undoOf }`). Each op is checked as its
 * single verb's job checks it, inside the write.
 */
export interface DocumentApplyWorkerRequest<
  C extends Coordinates = PageCoordinates,
> extends WriteJobFields {
  kind: 'document.apply';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  /** The ops, with their bytes by role on the transfer list, as the single verbs send them. */
  change: Change<C, WireAnnotationResources>;
  /**
   * Who the change acts for, what they may do and what the document's
   * signatures forbid, checked inside the write against each op (the ops of
   * an undo included) and each annotation an op creates, changes or removes.
   * Creates stamp its identity, in the group the draft names; an undo needs
   * its user to be the one who made the change.
   */
  authority: ChangeAuthority;
  artifactPath?: string;
}

/**
 * What the engine kept of a change so it can undo it, as it crosses the
 * worker boundary: who made it and the steps that reverse it. Its steps are
 * the engine's own; a caller stores them and hands them back, never reads
 * them.
 */
export interface ChangeRecordPayload {
  readonly userId: string | null;
  readonly steps: readonly unknown[];
}

/** One change of a server request (see `DocumentApplyChangesWorkerRequest`). */
export interface ServerChange<C extends Coordinates = PageCoordinates> {
  opId: string;
  change: Change<C, WireAnnotationResources>;
  /** Who the change acts for (see `DocumentApplyWorkerRequest.authority`). */
  authority: ChangeAuthority;
  /**
   * For an undo of a change outside this request: the record that change
   * left, or null when it left none (it was refused, or wrote nothing). The
   * caller checked who may undo it and that nothing ended undo since. An undo
   * of an earlier change of the same request leaves it out: the job keeps
   * the records of its own changes.
   */
  record?: ChangeRecordPayload | null;
}

/**
 * A server request's changes, as one job: each runs in its own layer
 * transaction, committed or rolled back on its own, in order. A refusal is
 * that change's answer; anything else fails the job. The job saves one
 * artifact for the changes that applied.
 */
export interface DocumentApplyChangesWorkerRequest<C extends Coordinates = PageCoordinates> {
  kind: 'document.applyChanges';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  changes: ServerChange<C>[];
  /** See `WriteJobFields.objectNumberFloor`. */
  objectNumberFloor?: number;
  artifactPath?: string;
}

/** What one change of a server request answered. */
export type ServerChangeOutcome<C extends Coordinates = PageCoordinates> =
  | {
      opId: string;
      status: 'applied';
      result: ChangeResult<C>;
      /** What undoes it, for the caller to keep; null when nothing can. */
      record: ChangeRecordPayload | null;
    }
  | { opId: string; status: 'refused'; error: SerializedEngineError };

export interface AnnotationsDeleteWorkerRequest extends WriteJobFields {
  kind: 'annotations.delete';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: AnnotationRef;
  /**
   * Who the delete acts for and what they may do, checked inside the write
   * against the annotation and everything deleted with it (`deletedWith`).
   */
  authority: AnnotationAuthority;
  artifactPath?: string;
}

/** Flatten a chosen set of one page's annotations into its content — see
 *  `AnnotationFlattenInput`. A content + annotation mutation of that page. */
export interface AnnotationsFlattenWorkerRequest extends WriteJobFields {
  kind: 'annotations.flatten';
  effect: 'contentWrite';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  refs: AnnotationRef[];
  usage: PageFlattenUsage;
  artifactPath?: string;
}

/** Flatten a chosen set of one page's annotation appearances into a new
 *  single-page PDF (bytes). A read: no artifact, no revision. */
export interface AnnotationsExportAppearanceWorkerRequest {
  kind: 'annotations.exportAppearance';
  effect: 'snapshot';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  refs: AnnotationRef[];
}

/** Annotations and their resources as one bundle (`doc.annotations.export`). A read. */
export interface AnnotationsExportWorkerRequest {
  kind: 'annotations.export';
  effect: 'snapshot';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  selection: AnnotationExportSelection;
  /** The limits the bundle must stay within; the defaults otherwise. */
  limits?: AnnotationBundleLimits;
}

/**
 * A bundle's annotations, created as one change (`doc.annotations.import`).
 * The producer puts each resource's buffer on the transfer list. The bundle
 * stays in page space on its way in: the import measures each item on the
 * page it goes to, which only the import works out.
 */
export interface AnnotationsImportWorkerRequest extends WriteJobFields {
  kind: 'annotations.import';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  bundle: WireAnnotationBundle;
  pages?: AnnotationImportPages;
  attribution: 'restore' | 'stamp';
  /**
   * The session: who `'stamp'` attributes each annotation to, as on create,
   * and whose user `'restore'` records as `importedBy`.
   */
  actor?: AnnotationActor;
  /** The limits the bundle must stay within; the defaults otherwise. */
  limits?: AnnotationBundleLimits;
  artifactPath?: string;
}

/** An annotation's `appearance` resource: its drawing, as a one-page PDF (bytes). A read. */
export interface AnnotationsReadAppearanceWorkerRequest {
  kind: 'annotations.readAppearance';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  ref: AnnotationRef;
}

/**
 * Batch annotation reorder. Refs are resolved on the worker before the
 * move so the impact computation has a single before-state and one
 * revision bump per batch.
 */
export interface AnnotationsMoveWorkerRequest extends WriteJobFields {
  kind: 'annotations.move';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  refs: AnnotationRef[];
  toIndex: number;
  artifactPath?: string;
}

/**
 * Complete reconciled form snapshot. Cheap between mutations: the worker
 * caches the underlying EPDFForm model keyed on the session's mutation
 * counter and rebuilds only after a write.
 */
export interface FormsListWorkerRequest {
  kind: 'forms.list';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
}

export interface FormsSetValueWorkerRequest extends WriteJobFields {
  kind: 'forms.setValue';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  value: FormFieldValue;
  artifactPath?: string;
}

export interface FormsResetWorkerRequest extends WriteJobFields {
  kind: 'forms.reset';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  /** The fields to reset; absent resets the whole form. */
  refs?: FormFieldRef[];
  artifactPath?: string;
}

export interface FormsApplyEffectsWorkerRequest extends WriteJobFields {
  kind: 'forms.applyEffects';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  effects: FormEffect[];
  artifactPath?: string;
}

export interface FormsExportWorkerRequest {
  kind: 'forms.export';
  effect: 'snapshot';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  format: FormDataFormat;
}

export interface FormsImportWorkerRequest extends WriteJobFields {
  kind: 'forms.import';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  /** FDF or XFDF payload; goes on the wirePack transfer list (zero-copy). */
  data: ArrayBuffer;
  /** Sniffed from the bytes when omitted. */
  format?: FormDataFormat;
  artifactPath?: string;
}

export interface FormsRepairWorkerRequest extends WriteJobFields {
  kind: 'forms.repair';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  bakeAppearances?: boolean;
  artifactPath?: string;
}

export interface FormsCreateFieldWorkerRequest<
  C extends Coordinates = PageCoordinates,
> extends WriteJobFields {
  kind: 'forms.createField';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  draft: FormFieldDraft<C>;
  /** The field's object number; the next free one when absent. */
  objectNumber?: number;
  /** Its widgets' object numbers, in `draft.widgets` order; the next free ones when absent. */
  widgetObjectNumbers?: number[];
  artifactPath?: string;
}

export interface FormsUpdateFieldWorkerRequest extends WriteJobFields {
  kind: 'forms.updateField';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  patch: FormFieldPatch;
  artifactPath?: string;
}

/** Draw a PDF page into every widget of an unsigned signature field (the visual fill). */
export interface FormsSetSignatureAppearanceWorkerRequest extends WriteJobFields {
  kind: 'forms.setSignatureAppearance';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  pdf: ArrayBuffer;
  artifactPath?: string;
}

export interface FormsDeleteFieldWorkerRequest extends WriteJobFields {
  kind: 'forms.deleteField';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  artifactPath?: string;
}

export interface FormsAddWidgetWorkerRequest<
  C extends Coordinates = PageCoordinates,
> extends WriteJobFields {
  kind: 'forms.addWidget';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  placement: WidgetPlacement<C>;
  /** The new widget's object number; the next free one when absent. */
  objectNumber?: number;
  /** Where a merged field's widget moves when it splits; the next free one when absent. */
  splitObjectNumber?: number;
  artifactPath?: string;
}

export interface FormsDetachWidgetWorkerRequest extends WriteJobFields {
  kind: 'forms.detachWidget';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  widget: AnnotationRef;
  artifactPath?: string;
}

export interface PagesListWorkerRequest {
  kind: 'pages.list';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
}

/**
 * Per-page plain-text extraction. Acquires a pagePtr and runs PDFium's
 * `FPDFText_LoadPage` → `FPDFText_GetText` chain: a slow-path per-page
 * read keyed by indirect object number.
 */
export interface PagesTextWorkerRequest {
  kind: 'pages.text';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
}

export interface PagesGeometryWorkerRequest {
  kind: 'pages.geometry';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
}

/**
 * A search request as the worker runs it: the request plus `skip`, a trusted
 * absolute resume position (scan-order pages already searched). For callers
 * that pin content versions themselves — the cloud wire pins the search
 * content epoch in the URL, so its routes resume by position alone.
 * Everyone else uses `cursor`, which also guards against changes between
 * batches; `cursor` takes precedence when both are set.
 */
export interface SearchScanRequest extends SearchRequest {
  skip?: number;
}

/**
 * One budgeted search batch (see `DocumentSearchService`). Read-only: the
 * worker's per-page corpus cache is version-keyed on the session mutation
 * counter, so repeated batches between mutations reuse extracted text.
 */
export interface SearchQueryWorkerRequest {
  kind: 'search.query';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  request: SearchScanRequest;
}

export interface PagesRenderWorkerRequest<C extends Coordinates = PageCoordinates> {
  kind: 'pages.render';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  options?: PageRenderOptions<C>;
}

/**
 * One-shot file render — open the base document from a file path, render
 * one page by display index, close. No session is bound (the ingestion
 * `runAdHoc` pattern, like `document.probeSecurityFile`): this is the
 * derived-artifact warmer's producer, used when no live document session
 * exists yet. The payload reports the page's durable object number so the
 * caller can key the artifact it persists.
 */
export interface DocumentRenderPageFileWorkerRequest {
  kind: 'document.renderPageFile';
  effect: 'read';
  jobId: WorkerJobId;
  path: string;
  password: string | null;
  /** Display index (0-based) — ingest knows "first page", not object numbers. */
  pageIndex: number;
  options?: PageRenderOptions;
}

/**
 * Encode instruction for the `*.renderEncoded` request family. Cloud-server
 * surface (like the file-path ops): the server worker injects an image
 * encoder into its `WorkerHost`, so the raster is encoded where IT is
 * produced and only the compressed image crosses the engine boundary —
 * kilobytes over the host IPC pipe instead of a megabytes-scale rgba
 * copy. Engines without an injected encoder (browser/local workers, which
 * encode via canvas instead) reject these kinds with `NotImplemented`.
 * Policy stays caller-side: format and quality always arrive in the
 * request; the engine plane holds no image-policy defaults.
 */
export interface RenderEncode {
  format: PageNetworkRenderFormat;
  quality?: number;
}

/** An encoded render result. `width`/`height` are the source raster's output
 *  dimensions (they feed the advisory image-dimension headers). `bytes` must
 *  own its buffer — it rides the transfer manifest zero-copy, so a pooled
 *  view (e.g. a Node `Buffer` slab slice) would detach unrelated data. */
export interface EncodedImageWire {
  contentType: string;
  width: number;
  height: number;
  bytes: Uint8Array;
}

export interface PagesRenderEncodedWorkerRequest<C extends Coordinates = PageCoordinates> {
  kind: 'pages.renderEncoded';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  options?: PageRenderOptions<C>;
  encode: RenderEncode;
}

/** `document.renderPageFile` + in-worker encode — same one-shot transient
 *  session semantics; see that request's docs. */
export interface DocumentRenderPageFileEncodedWorkerRequest {
  kind: 'document.renderPageFileEncoded';
  effect: 'read';
  jobId: WorkerJobId;
  path: string;
  password: string | null;
  /** Display index (0-based) — ingest knows "first page", not object numbers. */
  pageIndex: number;
  options?: PageRenderOptions;
  encode: RenderEncode;
}

export interface AnnotationsRenderAppearancesEncodedWorkerRequest {
  kind: 'annotations.renderAppearancesEncoded';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  options?: AnnotationAppearanceRenderOptions;
  encode: RenderEncode;
}

/** Encoded counterpart of `AnnotationAppearanceRaster`: same identity and
 *  placement metadata, image instead of raster. */
export interface EncodedAppearanceWire<C extends Coordinates = PageCoordinates> {
  ref: AnnotationRef;
  mode: AnnotationAppearanceMode;
  state: string | null;
  rect: C['box'];
  image: EncodedImageWire;
}

export interface AnnotationAppearancesEncodedResultWire<C extends Coordinates = PageCoordinates> {
  page: PageRef;
  appearances: EncodedAppearanceWire<C>[];
}

export interface PagesMoveWorkerRequest extends WriteJobFields {
  kind: 'pages.move';
  effect: 'contentWrite';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  pages: PageRef[];
  toIndex: number;
  artifactPath?: string;
}

export interface PagesRotateWorkerRequest extends WriteJobFields {
  kind: 'pages.rotate';
  effect: 'contentWrite';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  pages: PageRef[];
  /** Absolute rotation in degrees clockwise — see `PageRotateInput`. */
  rotation: PdfRotation;
  artifactPath?: string;
}

export interface PagesDeleteWorkerRequest extends WriteJobFields {
  kind: 'pages.delete';
  effect: 'contentWrite';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  pages: PageRef[];
  artifactPath?: string;
}

/** Register/rename a `/Names /Pages` entry — see `PageNameInput`. */
export interface PagesSetNameWorkerRequest extends WriteJobFields {
  kind: 'pages.setName';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  name: string;
  page: PageRef;
  replace?: string;
  artifactPath?: string;
}

/** Remove a `/Names /Pages` entry — see `PageRemoveNameInput`. */
export interface PagesRemoveNameWorkerRequest extends WriteJobFields {
  kind: 'pages.removeName';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  name: string;
  artifactPath?: string;
}

export interface PagesFlattenWorkerRequest extends WriteJobFields {
  kind: 'pages.flatten';
  effect: 'contentWrite';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  pages: PageRef[];
  usage: PageFlattenUsage;
  artifactPath?: string;
}

export interface RedactionApplyWorkerRequest extends WriteJobFields {
  kind: 'redaction.apply';
  effect: 'contentWrite';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  scope: RedactionApplyScope;
  artifactPath?: string;
}

/** Export the given pages as a standalone PDF (a read — the source
 *  session is untouched, so no layer artifact rides the result). */
export interface PagesExtractWorkerRequest {
  kind: 'pages.extract';
  effect: 'snapshot';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  pages: PageRef[];
}

/** List the document catalog's `/EmbeddedFiles` name tree (a read). */
export interface AttachmentsListWorkerRequest {
  kind: 'attachments.list';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
}

/**
 * Decode one document-level embedded file (a read — no revision bump, no
 * layer artifact). Two delivery modes, the `artifactPath?` pattern:
 * `path` absent → browser mode, decoded bytes ride the transfer list;
 * `path` present → server mode, the worker streams the decoded file to
 * that path (`EPDFAttachment_ExtractFile` + `FPDF_FILEWRITE`) so the
 * payload never crosses the thread boundary and HTTP can stream it from
 * disk with backpressure.
 */
export interface AttachmentsReadFileWorkerRequest {
  kind: 'attachments.readFile';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: AttachmentRef;
  path?: string;
  /** Decompression-bomb cap forwarded to the runtime. Absent/0 = unlimited. */
  maxDecodedBytes?: number;
}

/**
 * Create a document-level embedded file (a mutation — layer sessions
 * persist an artifact). `file` is the same post-normalization wire shape
 * the file-attachment annotation draft uses: metadata in JSON, bytes
 * out-of-band under the referenced resource key. `file.name` becomes the
 * name-tree key.
 */
export interface AttachmentsCreateWorkerRequest extends WriteJobFields {
  kind: 'attachments.create';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  file: WireAttachmentFile;
  /** Binary payload referenced by `file.resource` — transfer-list bytes. */
  resources?: WireResourceMap;
  artifactPath?: string;
}

/** Delete a document-level embedded file by key (a mutation). */
export interface AttachmentsDeleteWorkerRequest extends WriteJobFields {
  kind: 'attachments.delete';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: AttachmentRef;
  artifactPath?: string;
}

/** Decode the file embedded in a FileAttachment annotation's `/FS`.
 *  Same read semantics and delivery modes as `attachments.readFile`. */
export interface AnnotationsReadFileWorkerRequest {
  kind: 'annotations.readFile';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  ref: AnnotationRef;
  path?: string;
  /** Decompression-bomb cap forwarded to the runtime. Absent/0 = unlimited. */
  maxDecodedBytes?: number;
}

/** Insert every page of a standalone PDF (transferable `bytes`) at
 *  `toIndex` (omitted → append). A structural mutation: layer sessions
 *  persist an artifact like move/rotate/delete. */
export interface PagesInsertWorkerRequest extends WriteJobFields {
  kind: 'pages.insert';
  effect: 'contentWrite';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  bytes: ArrayBuffer;
  toIndex?: number;
  artifactPath?: string;
}

/** Create `count` (default 1) blank pages of `size` (PDF points) at
 *  `toIndex` (omitted → append). A structural mutation exactly like
 *  `pages.insert`, minus the bytes: pure parameters, so nothing transfers;
 *  layer sessions persist an artifact identically. */
export interface PagesInsertBlankWorkerRequest extends WriteJobFields {
  kind: 'pages.insertBlank';
  effect: 'contentWrite';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  size: PdfSize;
  count?: number;
  toIndex?: number;
  /** The object numbers the new pages get, one per page; the next free ones when absent. */
  objectNumbers?: number[];
  artifactPath?: string;
}

/**
 * `/PieceInfo` private application data (ISO 32000 §14.5). One job family
 * serves both levels: `pageObjectNumber` present → the page's `/PieceInfo`,
 * absent → the document catalog's — mirroring the native API symmetry.
 * `update`/`clear` are mutations (a layer session persists an artifact);
 * `read`/`applications` are plain reads.
 */
export interface MeasureViewportsWorkerRequest {
  kind: 'measure.viewports';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
}
export interface MeasureSetScaleWorkerRequest extends WriteJobFields {
  kind: 'measure.setScale';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  measure: PdfMeasure | null;
  artifactPath?: string;
}

export interface PieceInfoReadWorkerRequest {
  kind: 'pieceInfo.read';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page?: PageRef;
  application: string;
}

export interface PieceInfoUpdateWorkerRequest extends WriteJobFields {
  kind: 'pieceInfo.update';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page?: PageRef;
  application: string;
  patch: PieceInfoPatch;
  artifactPath?: string;
}

export interface PieceInfoApplicationsWorkerRequest {
  kind: 'pieceInfo.applications';
  effect: 'read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page?: PageRef;
}

export interface PieceInfoDeleteWorkerRequest extends WriteJobFields {
  kind: 'pieceInfo.delete';
  effect: 'write';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page?: PageRef;
  application: string;
  artifactPath?: string;
}

export interface DocumentSaveBufferWorkerRequest {
  kind: 'document.saveBuffer';
  effect: 'snapshot';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  mode: PdfSaveMode;
}

export interface DocumentSaveFileWorkerRequest {
  kind: 'document.saveFile';
  effect: 'snapshot';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  mode: PdfSaveMode;
  path: string;
}

/** Export just the layer artifact (the overlay diff) to a transferable buffer.
 *  Layer sessions only; the host rejects a base-only session. */
export interface DocumentSaveLayerBufferWorkerRequest {
  kind: 'document.saveLayerBuffer';
  effect: 'snapshot';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
}

export interface DocumentSecurityProbeInfo {
  encryptionState: 'unknown' | 'none' | 'encrypted' | 'unsupported';
  encryptionRequiresPassword: boolean | null;
  securityHandlerRevision: number | null;
  pdfPermissionsBits: number | null;
  pdfPermissionsAllAllowed: boolean | null;
  pdfOpenedAs: 'none' | 'user' | 'owner' | null;
  securityProbedAt: number | null;
}

export interface DocumentProbeSecurityFileWorkerRequest {
  kind: 'document.probeSecurityFile';
  effect: 'read';
  jobId: WorkerJobId;
  path: string;
  password: string | null;
}

export interface DocumentCheckPasswordPermissionsWorkerRequest {
  kind: 'document.checkPasswordPermissions';
  effect: 'open';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  password: string;
  mode?: 'any' | 'owner';
}

/**
 * Register a runtime font on the host's PDFium thread. Carries the font bytes
 * as a transferable `ArrayBuffer` (declared in the producer's transfer
 * manifest, like `open.fatMem`). Runtime-global: not tied to any docId. The
 * host keeps the volatile native `FontId` keyed by `fontKey`; the wire only
 * ever references the stable `fontKey`.
 */
export interface FontsRegisterWorkerRequest {
  kind: 'fonts.register';
  effect: 'runtimeWrite';
  jobId: WorkerJobId;
  fontKey: string;
  /** `""` → infer the base font name from the file. */
  familyName: string;
  /** `0` → infer the weight from the file. */
  weight: number;
  /** `-1` → infer / `0` non-italic / `1` italic. */
  italic: number;
  data: ArrayBuffer;
}

export interface FontsAddFallbackWorkerRequest {
  kind: 'fonts.addFallback';
  effect: 'runtimeWrite';
  jobId: WorkerJobId;
  fontKey: string;
}

export interface FontsClearFallbacksWorkerRequest {
  kind: 'fonts.clearFallbacks';
  effect: 'runtimeWrite';
  jobId: WorkerJobId;
}

/**
 * Hand the session `count` more object numbers: the layer's last object
 * number moves up by `count`, and the numbers passed become the session's to
 * name objects with. Only a session that hands numbers out itself
 * (`objectNumbers: 'session'`) takes it. Refused with `LayerFull` past
 * `OBJECT_NUMBER_ISSUE_LIMIT`.
 */
export interface ObjectNumbersReserveWorkerRequest {
  kind: 'objectNumbers.reserve';
  effect: 'session';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  count: number;
}

export interface FontsClearWorkerRequest {
  kind: 'fonts.clear';
  effect: 'runtimeWrite';
  jobId: WorkerJobId;
}

/** The application asserts a licence permitting editing with a font. */
export interface FontsAuthorizeEditingWorkerRequest {
  kind: 'fonts.authorizeEditing';
  effect: 'runtimeWrite';
  jobId: WorkerJobId;
  fontKey: string;
}

/**
 * Per-document font and text-layout settings (session state on the host's
 * document, never written to the file). Every member is optional: only the
 * ones given change.
 */
export interface DocumentSetFontSettingsWorkerRequest {
  kind: 'document.setFontSettings';
  effect: 'session';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  embeddingPolicy?: 'default' | 'subset' | 'full';
  typographicFeatures?: boolean;
}

export interface CloseWorkerRequest {
  kind: 'close';
  effect: 'close';
  jobId: WorkerJobId;
  docId: string;
}

/**
 * Close exactly one layer session, leaving the base document, sibling
 * layer sessions, and the caller's doc↔worker binding intact. Idempotent:
 * closing an absent session is a no-op ack.
 *
 * This is the reload seam for layer-session freshness (the server closes
 * a stale layer session and re-opens it from the current durable
 * artifact) — `close` is the whole-document teardown, this is the
 * layer-scoped sibling.
 */
export interface LayerCloseWorkerRequest {
  kind: 'layer.close';
  effect: 'close';
  jobId: WorkerJobId;
  docId: string;
  layerName: string;
}

export interface AbortWorkerRequest {
  kind: 'abort';
  jobId: WorkerJobId;
}

/**
 * What a view shows of a document (`DocumentHandle.setWorkingSet`): the order
 * its parsed pages close in. The worker takes it on arrival, even while a
 * render runs, and never answers: `jobId` only names the message.
 */
export interface PagesWorkingSetWorkerRequest {
  kind: 'pages.workingSet';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  view: string;
  pages: WorkingSetPage[];
}

export interface ShutdownWorkerRequest {
  kind: 'shutdown';
  jobId: WorkerJobId;
}

export interface LayerArtifactWorkerPayload {
  bytes: ArrayBuffer;
  size: number;
  /** The layer's last object number as saved: every object it has is at or below it. */
  lastObjectNumber: number;
}

/**
 * Result of an attachment file read (`attachments.readFile` /
 * `annotations.readFile`): the decoded file's metadata plus exactly one
 * delivery mode, mirroring the request's `path?` — `bytes` on the
 * transfer list (browser), or the `path` the worker wrote (server).
 */
export interface AttachmentFileWorkerPayload {
  name: string;
  mimeType?: string;
  size: number;
  bytes?: ArrayBuffer;
  path?: string;
}

export interface LayerArtifactFileWorkerPayload {
  path: string;
  /** The layer's last object number as saved: every object it has is at or below it. */
  lastObjectNumber: number;
}

/**
 * Every request a worker takes. `C` is where a request's places are: page
 * space as callers send them, the file's coordinates once the worker has
 * converted them for its handlers.
 */
export type WorkerRequest<C extends Coordinates = PageCoordinates> =
  | OpenWorkerRequest
  | MetadataReadWorkerRequest
  | MetadataUpdateWorkerRequest
  | MetadataReadCustomWorkerRequest
  | MetadataUpdateCustomWorkerRequest
  | ActionsReadWorkerRequest
  | AnnotationsListWorkerRequest
  | AnnotationsRenderAppearancesWorkerRequest
  | AnnotationsRenderAppearancesEncodedWorkerRequest
  | AnnotationsCreateWorkerRequest<C>
  | AnnotationsUpdateWorkerRequest<C>
  | AnnotationsDeleteWorkerRequest
  | AnnotationsMoveWorkerRequest
  | DocumentApplyWorkerRequest<C>
  | DocumentApplyChangesWorkerRequest<C>
  | FormsListWorkerRequest
  | FormsSetValueWorkerRequest
  | FormsResetWorkerRequest
  | FormsApplyEffectsWorkerRequest
  | FormsExportWorkerRequest
  | FormsImportWorkerRequest
  | FormsRepairWorkerRequest
  | FormsCreateFieldWorkerRequest<C>
  | FormsUpdateFieldWorkerRequest
  | FormsSetSignatureAppearanceWorkerRequest
  | FormsDeleteFieldWorkerRequest
  | FormsAddWidgetWorkerRequest<C>
  | FormsDetachWidgetWorkerRequest
  | PagesListWorkerRequest
  | PagesMoveWorkerRequest
  | PagesRotateWorkerRequest
  | PagesDeleteWorkerRequest
  | AnnotationsFlattenWorkerRequest
  | AnnotationsExportAppearanceWorkerRequest
  | PagesSetNameWorkerRequest
  | PagesRemoveNameWorkerRequest
  | PagesFlattenWorkerRequest
  | RedactionApplyWorkerRequest
  | PagesExtractWorkerRequest
  | PagesInsertWorkerRequest
  | PagesInsertBlankWorkerRequest
  | AttachmentsListWorkerRequest
  | AttachmentsReadFileWorkerRequest
  | AttachmentsCreateWorkerRequest
  | AttachmentsDeleteWorkerRequest
  | AnnotationsReadFileWorkerRequest
  | AnnotationsReadAppearanceWorkerRequest
  | AnnotationsExportWorkerRequest
  | AnnotationsImportWorkerRequest
  | MeasureViewportsWorkerRequest
  | MeasureSetScaleWorkerRequest
  | PieceInfoReadWorkerRequest
  | PieceInfoUpdateWorkerRequest
  | PieceInfoApplicationsWorkerRequest
  | PieceInfoDeleteWorkerRequest
  | PagesTextWorkerRequest
  | PagesGeometryWorkerRequest
  | PagesRenderWorkerRequest<C>
  | PagesRenderEncodedWorkerRequest<C>
  | SearchQueryWorkerRequest
  | DocumentSaveBufferWorkerRequest
  | DocumentSaveFileWorkerRequest
  | DocumentSaveLayerBufferWorkerRequest
  | DocumentProbeSecurityFileWorkerRequest
  | DocumentRenderPageFileWorkerRequest
  | DocumentRenderPageFileEncodedWorkerRequest
  | DocumentCheckPasswordPermissionsWorkerRequest
  | SignaturesListWorkerRequest
  | SignaturesContentsWorkerRequest
  | SignaturesDigestWorkerRequest
  | SignaturesRevisionBytesWorkerRequest
  | DocumentVersionWorkerRequest
  | SignaturesPrepareWorkerRequest
  | SignaturesCompleteWorkerRequest
  | SignaturesCancelWorkerRequest
  | SignaturesAnalyzeWorkerRequest
  | SignaturesFinalizeCandidateWorkerRequest
  | FontsRegisterWorkerRequest
  | FontsAddFallbackWorkerRequest
  | FontsClearFallbacksWorkerRequest
  | FontsClearWorkerRequest
  | FontsAuthorizeEditingWorkerRequest
  | ObjectNumbersReserveWorkerRequest
  | DocumentSetFontSettingsWorkerRequest
  | CloseWorkerRequest
  | LayerCloseWorkerRequest
  | WorkerControlMessage;

/** The messages that aren't jobs: the worker takes them on arrival and runs nothing for them. */
export type WorkerControlMessage =
  | AbortWorkerRequest
  | PagesWorkingSetWorkerRequest
  | ShutdownWorkerRequest;

/**
 * A request the worker runs as a job. Every one states its
 * {@link RequestEffect}: a request type without one fails `StatesItsEffect`,
 * so it doesn't compile.
 */
export type WorkerJobRequest<C extends Coordinates = PageCoordinates> = StatesItsEffect<
  Exclude<WorkerRequest<C>, WorkerControlMessage>
>;

type StatesItsEffect<T extends { effect: RequestEffect }> = T;

/**
 * What a job returns. `C` is the space its positions are in: the handlers
 * work in PDF space, and the worker converts every result to page space
 * before it leaves (`resultInPageSpace`).
 */
export type WorkerResultPayload<C extends Coordinates = PageCoordinates> =
  | {
      tag: 'open';
      docId: string;
      security: DocumentSecurityProbeInfo;
      /** What the document's signatures forbid; `null` when unsigned or not probed (a locked open). */
      protection?: DocumentProtection | null;
      /** A locked open whose password was given and wrong. */
      passwordRejected?: boolean;
      /** The numbers `reserveObjectNumbers` asked for; absent for a locked open. */
      objectNumbers?: ObjectNumberRange;
      /** The layer's last object number as it opened; absent for a locked open. */
      lastObjectNumber?: number;
    }
  | { tag: 'objectNumbers.reserve'; range: ObjectNumberRange }
  | { tag: 'signatures.list'; snapshot: SignatureSnapshot<C> }
  | { tag: 'signatures.contents'; bytes: ArrayBuffer }
  | { tag: 'signatures.digest'; digest: ArrayBuffer }
  | { tag: 'signatures.revisionBytes'; bytes: ArrayBuffer; size: number }
  | { tag: 'document.version'; version: BaseVersionInfo }
  | { tag: 'signatures.prepare'; result: SignaturePrepared }
  | {
      tag: 'signatures.complete';
      result: SignatureCompleteResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'signatures.cancel'; result: SignatureCancelResult }
  | { tag: 'signatures.analyze'; analysis: ChangeAnalysis }
  | {
      tag: 'signatures.finalizeCandidate';
      /**
       * The installed signature as the sealed file reports it, in page space:
       * the finalizer measures it while its own session is open.
       */
      signature: SignatureDTO;
      /** The sealed file's last object number: every object it has is at or below it. */
      lastObjectNumber: number;
      /** What the sealed file's signatures forbid from now on. */
      protection: DocumentProtection;
      /** The version the sealed file is (hash and length of the whole file). */
      version: BaseVersionInfo;
    }
  | { tag: 'metadata.read'; metadata: DocumentMetadata }
  | { tag: 'actions.read'; snapshot: DocumentActionsSnapshot<C['destination']> }
  | {
      tag: 'metadata.update';
      result: MetadataUpdateResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'metadata.readCustom'; custom: CustomMetadata }
  | {
      tag: 'metadata.updateCustom';
      result: CustomMetadataUpdateResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'annotations.list'; list: AnnotationList<C> }
  | { tag: 'annotations.renderAppearances'; page: PageRef; result: AnnotationAppearancesResult<C> }
  | {
      tag: 'annotations.renderAppearancesEncoded';
      page: PageRef;
      result: AnnotationAppearancesEncodedResultWire<C>;
    }
  | {
      tag: 'annotations.create';
      result: AnnotationCreateResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'annotations.update';
      result: AnnotationUpdateResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'annotations.delete';
      result: AnnotationDeleteResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'annotations.flatten';
      result: AnnotationFlattenResult;
      /** False when nothing was applied: no artifact, event, or version bump. */
      wrote: boolean;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'annotations.exportAppearance'; bytes: ArrayBuffer; size: number }
  | { tag: 'annotations.readAppearance'; bytes: ArrayBuffer; size: number }
  /** A bundle is page space on both sides: the exporter measures what leaves. */
  | { tag: 'annotations.export'; bundle: WireAnnotationBundle }
  | {
      tag: 'annotations.import';
      result: AnnotationImportResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'annotations.move';
      result: AnnotationMoveResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'document.applyChanges';
      /** One per change, in order. */
      outcomes: ServerChangeOutcome<C>[];
      /** The artifact, when at least one change applied. */
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'document.apply';
      result: ChangeResult<C>;
      /**
       * True when this answers an `opId` that already had one: nothing ran
       * again, so nothing is published again.
       */
      replayed: boolean;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'forms.list'; snapshot: FormSnapshot<C> }
  | {
      tag: 'forms.setValue';
      result: FormSetValueResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.reset';
      result: FormResetResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.applyEffects';
      result: FormEffectsResult<C>;
      /** False when the batch wrote nothing: no artifact, event, or version bump. */
      wrote: boolean;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'forms.export'; format: FormDataFormat; bytes: ArrayBuffer }
  | {
      tag: 'forms.import';
      result: FormImportResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.repair';
      result: FormRepairResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.createField';
      result: FormFieldCreateResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.updateField';
      result: FormFieldUpdateResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.setSignatureAppearance';
      result: FormFieldUpdateResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.deleteField';
      result: FormFieldDeleteResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.addWidget';
      result: FormWidgetLinkResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.detachWidget';
      result: FormWidgetLinkResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'pages.list'; snapshot: PageListSnapshot<C> }
  | {
      tag: 'pages.move';
      result: PageMoveResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.rotate';
      result: PageRotateResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.delete';
      result: PageDeleteResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.setName';
      result: PageNameResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.removeName';
      result: PageNameResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.flatten';
      result: PageFlattenResult;
      /** False when nothing was applied: no artifact, event, or version bump. */
      wrote: boolean;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'redaction.apply';
      result: RedactionApplyResult;
      /** False when nothing was applied: no artifact, event, or version bump. */
      wrote: boolean;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'pages.extract'; bytes: ArrayBuffer; size: number }
  | { tag: 'attachments.list'; attachments: Attachment[] }
  | { tag: 'attachments.readFile'; content: AttachmentFileWorkerPayload }
  | {
      tag: 'attachments.create';
      result: AttachmentCreateResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'attachments.delete';
      result: AttachmentDeleteResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'annotations.readFile'; content: AttachmentFileWorkerPayload }
  | {
      tag: 'pages.insert';
      result: PageInsertResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.insertBlank';
      result: PageInsertResult<C>;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'measure.viewports'; page: PageRef; viewports: PageMeasurementViewport<C>[] }
  | {
      tag: 'measure.setScale';
      result: PageScaleResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'pieceInfo.read'; snapshot: PieceInfoSnapshot | null }
  | {
      tag: 'pieceInfo.update';
      result: PieceInfoUpdateResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'pieceInfo.applications'; applications: string[] }
  | {
      tag: 'pieceInfo.delete';
      result: PieceInfoDeleteResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'pages.text'; snapshot: PageTextSnapshot }
  | { tag: 'pages.geometry'; page: PageRef; snapshot: PageGeometrySnapshot<C> }
  | {
      tag: 'pages.render';
      page: PageRef;
      /** The area of the page the pixels show. */
      area: C['box'];
      raster: PageRaster;
    }
  | { tag: 'pages.renderEncoded'; image: EncodedImageWire }
  | { tag: 'search.query'; slice: SearchSlice<C> }
  | { tag: 'document.saveBuffer'; bytes: ArrayBuffer; size: number }
  | { tag: 'document.saveLayerBuffer'; bytes: ArrayBuffer; size: number }
  | { tag: 'document.saveFile'; path: string }
  | { tag: 'document.probeSecurityFile'; security: DocumentSecurityProbeInfo }
  | {
      tag: 'document.renderPageFile';
      /** Durable page identity of the rendered index — the artifact key's page. */
      page: PageRef;
      pageCount: number;
      raster: PageRaster;
    }
  | {
      tag: 'document.renderPageFileEncoded';
      /** Durable page identity of the rendered index — the artifact key's page. */
      page: PageRef;
      pageCount: number;
      image: EncodedImageWire;
    }
  | {
      tag: 'document.checkPasswordPermissions';
      security: DocumentSecurityProbeInfo;
      protection?: DocumentProtection | null;
    }
  | { tag: 'fonts.register'; fontKey: string; identity: FontIdentityInfo }
  | { tag: 'fonts.addFallback' }
  | { tag: 'fonts.clearFallbacks' }
  | { tag: 'fonts.clear' }
  | { tag: 'fonts.authorizeEditing'; identity: FontIdentityInfo }
  | { tag: 'document.setFontSettings' }
  | { tag: 'close' }
  | { tag: 'shutdown' };

export type WorkerResponse =
  | { kind: 'resolve'; jobId: WorkerJobId; result: WorkerResultPayload }
  | { kind: 'reject'; jobId: WorkerJobId; error: SerializedEngineError };

export type WorkerLifecycleMessage = { kind: 'ready' } | { kind: 'init-error'; error: string };
