import type { PageScaleResult } from '../mutation/PageScaleResult';
import type { PdfMeasure, PageMeasurementViewport } from '../dto/Measure';
import type { FontIdentityInfo } from '../dto/FontSpec';
import type { AnnotationList } from '../annotation/AnnotationList';
import type { AnnotationDraft, AnnotationPatch } from '../annotation/kinds';
import type { WireAnnotationResources } from '../annotation/resources';
import type { AnnotationActor } from '../auth/scope';
import type {
  AnnotationAppearanceMode,
  AnnotationAppearanceRenderOptions,
  AnnotationAppearancesResult,
} from '../dto/AnnotationRender';
import type { EmbeddedFileItem, EmbeddedFileRef, WireAttachmentFile } from '../dto/Attachment';
import type { DocumentMetadata } from '../dto/DocumentMetadata';
import type { MetadataPatch } from '../dto/MetadataPatch';
import type { PageGeometrySnapshot } from '../dto/PageGeometrySnapshot';
import type { PageRotation } from '../dto/PageLayout';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { PageNetworkRenderFormat, PageRaster, PageRenderOptions } from '../dto/PageRender';
import type { PageTextSnapshot } from '../dto/PageTextSnapshot';
import type { DocumentActionsSnapshot } from '../dto/PdfAction';
import type { PdfSaveMode } from '../dto/PdfSaveMode';
import type { PieceInfoPatch, PieceInfoSnapshot } from '../dto/PieceInfo';
import type { SerializedEngineError } from '../errors/EngineError';
import type { FormFieldDraft } from '../forms/draft';
import type { FormEffect, FormEffectsResult } from '../forms/effects';
import type { FormFieldPatch } from '../forms/patch';
import type { FormSnapshot } from '../forms/snapshot';
import type { FormDataFormat, FormFieldValue } from '../forms/value';
import type { PdfSize, PdfRect } from '../geometry/primitives';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { FormFieldRef, FormWidget } from '../identity/FormFieldRef';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
import type { PageRef } from '../identity/PageRef';
import type { WireAnnotationBundle } from '../transfer/AnnotationBundle';
import type { AnnotationImportPages, AnnotationImportResult } from '../transfer/annotationImport';
import type { AnnotationBundleLimits } from '../transfer/bundleLimits';
import type { AnnotationExportSelection } from '../transfer/exportSelection';
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
import type {
  FormFieldCreateResult,
  FormFieldDeleteResult,
  FormFieldUpdateResult,
  FormImportResult,
  FormRepairResult,
  FormSetValueResult,
  FormWidgetLinkResult,
} from '../mutation/FormMutationResults';
import type { MetadataUpdateResult } from '../mutation/MetadataUpdateResult';
import type { AnnotationFlattenResult } from '../mutation/AnnotationFlattenResult';
import type { PageDeleteResult } from '../mutation/PageDeleteResult';
import type { PageFlattenResult, PageFlattenUsage } from '../mutation/PageFlattenResult';
import type { PageInsertResult } from '../mutation/PageInsertResult';
import type { PageMoveResult } from '../mutation/PageMoveResult';
import type { PageNameResult } from '../mutation/PageNameResult';
import type { PageRotateResult } from '../mutation/PageRotateResult';
import type { RedactionApplyResult, RedactionApplyScope } from '../mutation/RedactionApplyResult';
import type { WireResourceMap } from '../resource/BinarySource';
import type { PageState } from '../revision/PageState';
import type { SearchRequest, SearchSlice } from '../search/types';
import type { AnalyzeInput, ChangeAnalysis } from '../signature/analysis/types';
import type {
  BaseVersionInfo,
  DigestAlgorithm,
  DocumentProtection,
  SignatureAbortResult,
  SignatureCompleteInput,
  SignatureCompleteResult,
  SignatureDTO,
  SignaturePrepareInput,
  SignaturePrepared,
  SignatureSnapshot,
  SignedDocumentPolicy,
} from '../signature/types';
import type { SessionKind } from '../dto/SessionKind';

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

export interface OpenFatMemoryWorkerRequest {
  kind: 'open.fatMem';
  jobId: WorkerJobId;
  docId: string;
  bytes: ArrayBuffer;
  password: string | null;
  /** Default `protect`. */
  signedDocumentPolicy?: SignedDocumentPolicy;
  /** Default `layer`: the bytes become an immutable base with a fresh layer on top. */
  sessionKind?: SessionKind;
}

export type LayerOpenSource =
  | { kind: 'fresh' }
  | { kind: 'raw-delta'; bytes: ArrayBuffer }
  | { kind: 'artifact'; bytes: ArrayBuffer }
  | { kind: 'artifact-file'; path: string };

export interface OpenLayerMemoryBaseWorkerRequest {
  kind: 'open.layerMemBase';
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
}

export interface OpenLayerFileBaseWorkerRequest {
  kind: 'open.layerFileBase';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
}

export interface SignaturesDigestWorkerRequest {
  kind: 'signatures.digest';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  algorithm: DigestAlgorithm;
}

export interface SignaturesRevisionBytesWorkerRequest {
  kind: 'signatures.revisionBytes';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  revisionIndex: number;
}

export interface DocumentVersionWorkerRequest {
  kind: 'document.version';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
}

export interface SignaturesPrepareWorkerRequest {
  kind: 'signatures.prepare';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  input: SignaturePrepareInput;
}

export interface SignaturesCompleteWorkerRequest {
  kind: 'signatures.complete';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  input: SignatureCompleteInput;
  artifactPath?: string;
}

export interface SignaturesAbortWorkerRequest {
  kind: 'signatures.abort';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  signingId: string;
}

export interface SignaturesAnalyzeWorkerRequest {
  kind: 'signatures.analyze';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
}

export interface MetadataUpdateWorkerRequest {
  kind: 'metadata.update';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  patch: MetadataPatch;
  artifactPath?: string;
}

export interface ActionsReadWorkerRequest {
  kind: 'actions.read';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  options?: AnnotationAppearanceRenderOptions;
}

export interface AnnotationsCreateWorkerRequest {
  kind: 'annotations.create';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  draft: AnnotationDraft;
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

export interface AnnotationsUpdateWorkerRequest {
  kind: 'annotations.update';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: AnnotationRef;
  patch: AnnotationPatch;
  /** The bytes beside the patch, by role — see the create request. */
  resources?: WireAnnotationResources;
  artifactPath?: string;
  /**
   * Identity of the editor. Drives /EMBD_Metadata/UpdatedBy refresh on
   * update; preserves UserID/GroupID/CreatedBy. When absent, only /M
   * is refreshed.
   */
  actor?: AnnotationActor;
}

export interface AnnotationsDeleteWorkerRequest {
  kind: 'annotations.delete';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: AnnotationRef;
  artifactPath?: string;
}

/** Flatten a chosen set of one page's annotations into its content — see
 *  `AnnotationFlattenInput`. A content + annotation mutation of that page. */
export interface AnnotationsFlattenWorkerRequest {
  kind: 'annotations.flatten';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  refs: AnnotationRef[];
}

/** Annotations and their resources as one bundle (`doc.annotations.export`). A read. */
export interface AnnotationsExportWorkerRequest {
  kind: 'annotations.export';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  selection: AnnotationExportSelection;
  /** The limits the bundle must stay within; the defaults otherwise. */
  limits?: AnnotationBundleLimits;
}

/**
 * A bundle's annotations, created as one change (`doc.annotations.import`).
 * The producer puts each resource's buffer on the transfer list.
 */
export interface AnnotationsImportWorkerRequest {
  kind: 'annotations.import';
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
export interface AnnotationsMoveWorkerRequest {
  kind: 'annotations.move';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
}

export interface FormsSetValueWorkerRequest {
  kind: 'forms.setValue';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  value: FormFieldValue;
  artifactPath?: string;
}

export interface FormsResetWorkerRequest {
  kind: 'forms.reset';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  artifactPath?: string;
}

export interface FormsApplyEffectsWorkerRequest {
  kind: 'forms.applyEffects';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  effects: FormEffect[];
  artifactPath?: string;
}

export interface FormsExportWorkerRequest {
  kind: 'forms.export';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  format: FormDataFormat;
}

export interface FormsImportWorkerRequest {
  kind: 'forms.import';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  /** FDF or XFDF payload; goes on the wirePack transfer list (zero-copy). */
  data: ArrayBuffer;
  /** Sniffed from the bytes when omitted. */
  format?: FormDataFormat;
  artifactPath?: string;
}

export interface FormsRepairWorkerRequest {
  kind: 'forms.repair';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  bakeAppearances?: boolean;
  artifactPath?: string;
}

export interface FormsCreateFieldWorkerRequest {
  kind: 'forms.createField';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  draft: FormFieldDraft;
  artifactPath?: string;
}

export interface FormsUpdateFieldWorkerRequest {
  kind: 'forms.updateField';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  patch: FormFieldPatch;
  artifactPath?: string;
}

/** Draw a PDF page into every widget of an unsigned signature field (the visual fill). */
export interface FormsSetSignatureAppearanceWorkerRequest {
  kind: 'forms.setSignatureAppearance';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  pdf: ArrayBuffer;
  pageIndex: number;
  artifactPath?: string;
}

export interface FormsDeleteFieldWorkerRequest {
  kind: 'forms.deleteField';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  artifactPath?: string;
}

export interface FormsAttachWidgetWorkerRequest {
  kind: 'forms.attachWidget';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  widget: AnnotationRef;
  onState?: string;
  artifactPath?: string;
}

export interface FormsDetachWidgetWorkerRequest {
  kind: 'forms.detachWidget';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: FormFieldRef;
  widget: AnnotationRef;
  artifactPath?: string;
}

export interface PagesListWorkerRequest {
  kind: 'pages.list';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
}

export interface PagesGeometryWorkerRequest {
  kind: 'pages.geometry';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  request: SearchScanRequest;
}

export interface PagesRenderWorkerRequest {
  kind: 'pages.render';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  options?: PageRenderOptions;
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

export interface PagesRenderEncodedWorkerRequest {
  kind: 'pages.renderEncoded';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  options?: PageRenderOptions;
  encode: RenderEncode;
}

/** `document.renderPageFile` + in-worker encode — same one-shot transient
 *  session semantics; see that request's docs. */
export interface DocumentRenderPageFileEncodedWorkerRequest {
  kind: 'document.renderPageFileEncoded';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  options?: AnnotationAppearanceRenderOptions;
  encode: RenderEncode;
}

/** Encoded counterpart of `AnnotationAppearanceRaster`: same identity and
 *  placement metadata, image instead of raster. */
export interface EncodedAppearanceWire {
  ref: AnnotationRef;
  mode: AnnotationAppearanceMode;
  rect: PdfRect;
  image: EncodedImageWire;
}

export interface AnnotationAppearancesEncodedResultWire {
  pageState: PageState;
  appearances: EncodedAppearanceWire[];
}

export interface PagesMoveWorkerRequest {
  kind: 'pages.move';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  pages: PageRef[];
  destIndex: number;
  artifactPath?: string;
}

export interface PagesRotateWorkerRequest {
  kind: 'pages.rotate';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  pages: PageRef[];
  /** Absolute rotation in degrees clockwise — see `PageRotateInput`. */
  rotation: PageRotation;
  artifactPath?: string;
}

export interface PagesDeleteWorkerRequest {
  kind: 'pages.delete';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  pages: PageRef[];
  artifactPath?: string;
}

/** Register/rename a `/Names /Pages` entry — see `PageNameInput`. */
export interface PagesSetNameWorkerRequest {
  kind: 'pages.setName';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  name: string;
  page: PageRef;
  replace?: string;
  artifactPath?: string;
}

/** Remove a `/Names /Pages` entry — see `PageRemoveNameInput`. */
export interface PagesRemoveNameWorkerRequest {
  kind: 'pages.removeName';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  name: string;
  artifactPath?: string;
}

export interface PagesFlattenWorkerRequest {
  kind: 'pages.flatten';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  pages: PageRef[];
  usage: PageFlattenUsage;
  artifactPath?: string;
}

export interface RedactionApplyWorkerRequest {
  kind: 'redaction.apply';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  pages: PageRef[];
}

/** List the document catalog's `/EmbeddedFiles` name tree (a read). */
export interface AttachmentsListWorkerRequest {
  kind: 'attachments.list';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: EmbeddedFileRef;
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
export interface AttachmentsCreateWorkerRequest {
  kind: 'attachments.create';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  file: WireAttachmentFile;
  /** Binary payload referenced by `file.resource` — transfer-list bytes. */
  resources?: WireResourceMap;
  artifactPath?: string;
}

/** Delete a document-level embedded file by key (a mutation). */
export interface AttachmentsDeleteWorkerRequest {
  kind: 'attachments.delete';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  ref: EmbeddedFileRef;
  artifactPath?: string;
}

/** Decode the file embedded in a FileAttachment annotation's `/FS`.
 *  Same read semantics and delivery modes as `attachments.readFile`. */
export interface AnnotationsReadFileWorkerRequest {
  kind: 'annotations.readFile';
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
 *  `destIndex` (omitted → append). A structural mutation: layer sessions
 *  persist an artifact like move/rotate/delete. */
export interface PagesInsertWorkerRequest {
  kind: 'pages.insert';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  bytes: ArrayBuffer;
  destIndex?: number;
  artifactPath?: string;
}

/** Create `count` (default 1) blank pages of `size` (PDF points) at
 *  `destIndex` (omitted → append). A structural mutation exactly like
 *  `pages.insert`, minus the bytes: pure parameters, so nothing transfers;
 *  layer sessions persist an artifact identically. */
export interface PagesInsertBlankWorkerRequest {
  kind: 'pages.insertBlank';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  size: PdfSize;
  count?: number;
  destIndex?: number;
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
}
export interface MeasureSetScaleWorkerRequest {
  kind: 'measure.setScale';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page: PageRef;
  measure: PdfMeasure | null;
  artifactPath?: string;
}

export interface PieceInfoReadWorkerRequest {
  kind: 'pieceInfo.read';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page?: PageRef;
  application: string;
}

export interface PieceInfoUpdateWorkerRequest {
  kind: 'pieceInfo.update';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page?: PageRef;
}

export interface PieceInfoClearWorkerRequest {
  kind: 'pieceInfo.clear';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  page?: PageRef;
  application: string;
  artifactPath?: string;
}

export interface DocumentSaveBufferWorkerRequest {
  kind: 'document.saveBuffer';
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  mode: PdfSaveMode;
}

export interface DocumentSaveFileWorkerRequest {
  kind: 'document.saveFile';
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
  jobId: WorkerJobId;
  path: string;
  password: string | null;
}

export interface DocumentCheckPasswordPermissionsWorkerRequest {
  kind: 'document.checkPasswordPermissions';
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
  jobId: WorkerJobId;
  fontKey: string;
}

export interface FontsClearFallbacksWorkerRequest {
  kind: 'fonts.clearFallbacks';
  jobId: WorkerJobId;
}

export interface FontsClearWorkerRequest {
  kind: 'fonts.clear';
  jobId: WorkerJobId;
}

/** The application asserts a licence permitting editing with a font. */
export interface FontsAuthorizeEditingWorkerRequest {
  kind: 'fonts.authorizeEditing';
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
  jobId: WorkerJobId;
  docId: string;
  layerName?: string;
  embeddingPolicy?: 'default' | 'subset' | 'full';
  typographicFeatures?: boolean;
}

export interface CloseWorkerRequest {
  kind: 'close';
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
  jobId: WorkerJobId;
  docId: string;
  layerName: string;
}

export interface AbortWorkerRequest {
  kind: 'abort';
  jobId: WorkerJobId;
}

export interface ShutdownWorkerRequest {
  kind: 'shutdown';
  jobId: WorkerJobId;
}

export interface LayerArtifactWorkerPayload {
  bytes: ArrayBuffer;
  size: number;
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
}

export type WorkerRequest =
  | OpenWorkerRequest
  | MetadataReadWorkerRequest
  | MetadataUpdateWorkerRequest
  | ActionsReadWorkerRequest
  | AnnotationsListWorkerRequest
  | AnnotationsRenderAppearancesWorkerRequest
  | AnnotationsRenderAppearancesEncodedWorkerRequest
  | AnnotationsCreateWorkerRequest
  | AnnotationsUpdateWorkerRequest
  | AnnotationsDeleteWorkerRequest
  | AnnotationsMoveWorkerRequest
  | FormsListWorkerRequest
  | FormsSetValueWorkerRequest
  | FormsResetWorkerRequest
  | FormsApplyEffectsWorkerRequest
  | FormsExportWorkerRequest
  | FormsImportWorkerRequest
  | FormsRepairWorkerRequest
  | FormsCreateFieldWorkerRequest
  | FormsUpdateFieldWorkerRequest
  | FormsSetSignatureAppearanceWorkerRequest
  | FormsDeleteFieldWorkerRequest
  | FormsAttachWidgetWorkerRequest
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
  | PieceInfoClearWorkerRequest
  | PagesTextWorkerRequest
  | PagesGeometryWorkerRequest
  | PagesRenderWorkerRequest
  | PagesRenderEncodedWorkerRequest
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
  | SignaturesAbortWorkerRequest
  | SignaturesAnalyzeWorkerRequest
  | SignaturesFinalizeCandidateWorkerRequest
  | FontsRegisterWorkerRequest
  | FontsAddFallbackWorkerRequest
  | FontsClearFallbacksWorkerRequest
  | FontsClearWorkerRequest
  | FontsAuthorizeEditingWorkerRequest
  | DocumentSetFontSettingsWorkerRequest
  | CloseWorkerRequest
  | LayerCloseWorkerRequest
  | AbortWorkerRequest
  | ShutdownWorkerRequest;

export type WorkerResultPayload =
  | {
      tag: 'open';
      docId: string;
      security: DocumentSecurityProbeInfo;
      /** What the document's signatures forbid; `null` when unsigned or not probed (a locked open). */
      protection?: DocumentProtection | null;
      /** A locked open whose password was given and wrong. */
      passwordRejected?: boolean;
    }
  | { tag: 'signatures.list'; snapshot: SignatureSnapshot }
  | { tag: 'signatures.contents'; bytes: ArrayBuffer }
  | { tag: 'signatures.digest'; digest: ArrayBuffer }
  | { tag: 'signatures.revisionBytes'; bytes: ArrayBuffer; size: number }
  | { tag: 'document.version'; version: BaseVersionInfo }
  | { tag: 'signatures.prepare'; result: SignaturePrepared }
  | {
      tag: 'signatures.complete';
      result: SignatureCompleteResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'signatures.abort'; result: SignatureAbortResult }
  | { tag: 'signatures.analyze'; analysis: ChangeAnalysis }
  | {
      tag: 'signatures.finalizeCandidate';
      /** The installed signature as the sealed file reports it. */
      signature: SignatureDTO;
      /** What the sealed file's signatures forbid from now on. */
      protection: DocumentProtection;
      /** The version the sealed file is (hash and length of the whole file). */
      version: BaseVersionInfo;
    }
  | { tag: 'metadata.read'; metadata: DocumentMetadata }
  | { tag: 'actions.read'; snapshot: DocumentActionsSnapshot }
  | {
      tag: 'metadata.update';
      result: MetadataUpdateResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'annotations.list'; list: AnnotationList }
  | { tag: 'annotations.renderAppearances'; result: AnnotationAppearancesResult }
  | { tag: 'annotations.renderAppearancesEncoded'; result: AnnotationAppearancesEncodedResultWire }
  | {
      tag: 'annotations.create';
      result: AnnotationCreateResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'annotations.update';
      result: AnnotationUpdateResult;
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
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'annotations.exportAppearance'; bytes: ArrayBuffer; size: number }
  | { tag: 'annotations.readAppearance'; bytes: ArrayBuffer; size: number }
  | { tag: 'annotations.export'; bundle: WireAnnotationBundle }
  | {
      tag: 'annotations.import';
      result: AnnotationImportResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'annotations.move';
      result: AnnotationMoveResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'forms.list'; snapshot: FormSnapshot }
  | {
      tag: 'forms.setValue';
      result: FormSetValueResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.reset';
      result: FormSetValueResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.applyEffects';
      result: FormEffectsResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'forms.export'; format: FormDataFormat; bytes: ArrayBuffer }
  | {
      tag: 'forms.import';
      result: FormImportResult;
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
      result: FormFieldCreateResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.updateField';
      result: FormFieldUpdateResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.setSignatureAppearance';
      result: FormFieldUpdateResult;
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
      tag: 'forms.attachWidget';
      result: FormWidgetLinkResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'forms.detachWidget';
      result: FormWidgetLinkResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'pages.list'; snapshot: PageListSnapshot }
  | {
      tag: 'pages.move';
      result: PageMoveResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.rotate';
      result: PageRotateResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.delete';
      result: PageDeleteResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.setName';
      result: PageNameResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.removeName';
      result: PageNameResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.flatten';
      result: PageFlattenResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'redaction.apply';
      result: RedactionApplyResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'pages.extract'; bytes: ArrayBuffer; size: number }
  | { tag: 'attachments.list'; items: EmbeddedFileItem[] }
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
      result: PageInsertResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | {
      tag: 'pages.insertBlank';
      result: PageInsertResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'measure.viewports'; viewports: PageMeasurementViewport[] }
  | {
      tag: 'measure.setScale';
      result: PageScaleResult;
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'pieceInfo.read'; snapshot: PieceInfoSnapshot | null }
  | {
      tag: 'pieceInfo.update';
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'pieceInfo.applications'; applications: string[] }
  | {
      tag: 'pieceInfo.clear';
      artifact?: LayerArtifactWorkerPayload;
      artifactFile?: LayerArtifactFileWorkerPayload;
    }
  | { tag: 'pages.text'; snapshot: PageTextSnapshot }
  | { tag: 'pages.geometry'; snapshot: PageGeometrySnapshot }
  | { tag: 'pages.render'; raster: PageRaster }
  | { tag: 'pages.renderEncoded'; image: EncodedImageWire }
  | { tag: 'search.query'; slice: SearchSlice }
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
