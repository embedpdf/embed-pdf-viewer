import type {
  MeasureViewportsWorkerRequest,
  MeasureSetScaleWorkerRequest,
} from '@embedpdf/engine-core/runtime';
import {
  DEFAULT_ANNOTATION_BUNDLE_LIMITS,
  AbortError,
  EMPTY_TRANSFER,
  EngineError,
  EngineErrorCode,
  serializeError,
  wirePack,
  type AnnotationsCreateWorkerRequest,
  type AnnotationsDeleteWorkerRequest,
  type DocumentCheckPasswordPermissionsWorkerRequest,
  type DocumentProbeSecurityFileWorkerRequest,
  type DocumentRenderPageFileWorkerRequest,
  type DocumentSaveBufferWorkerRequest,
  type DocumentSaveFileWorkerRequest,
  type DocumentSaveLayerBufferWorkerRequest,
  type FormsAddWidgetWorkerRequest,
  type FormsCreateFieldWorkerRequest,
  type FormsDeleteFieldWorkerRequest,
  type FormsDetachWidgetWorkerRequest,
  type FormsExportWorkerRequest,
  type FormsImportWorkerRequest,
  type FormsListWorkerRequest,
  type FormsRepairWorkerRequest,
  type FormsUpdateFieldWorkerRequest,
  type FormsSetSignatureAppearanceWorkerRequest,
  type FormsResetWorkerRequest,
  type FormsSetValueWorkerRequest,
  type SignaturesListWorkerRequest,
  type SignaturesPrepareWorkerRequest,
  type SignaturesCompleteWorkerRequest,
  type SignaturesCancelWorkerRequest,
  type SignaturesAnalyzeWorkerRequest,
  type SignaturesFinalizeCandidateWorkerRequest,
  type SignaturesContentsWorkerRequest,
  type SignaturesDigestWorkerRequest,
  type SignaturesRevisionBytesWorkerRequest,
  type DocumentVersionWorkerRequest,
  type DocumentProtection,
  type PdfSaveMode,
  type FontsRegisterWorkerRequest,
  type FontsAddFallbackWorkerRequest,
  type FontsClearFallbacksWorkerRequest,
  type FontsClearWorkerRequest,
  type FontsAuthorizeEditingWorkerRequest,
  type DocumentSetFontSettingsWorkerRequest,
  type AnnotationsListWorkerRequest,
  type AnnotationsRenderAppearancesWorkerRequest,
  type AnnotationsMoveWorkerRequest,
  type AnnotationsUpdateWorkerRequest,
  type CloseWorkerRequest,
  type LayerCloseWorkerRequest,
  type MetadataReadWorkerRequest,
  type MetadataUpdateWorkerRequest,
  type MetadataReadCustomWorkerRequest,
  type MetadataUpdateCustomWorkerRequest,
  type ActionsReadWorkerRequest,
  type OpenWorkerRequest,
  type PagesListWorkerRequest,
  type PagesGeometryWorkerRequest,
  type PagesMoveWorkerRequest,
  type PagesRotateWorkerRequest,
  type PagesDeleteWorkerRequest,
  type PagesSetNameWorkerRequest,
  type AnnotationsFlattenWorkerRequest,
  type AnnotationsExportAppearanceWorkerRequest,
  type PagesRemoveNameWorkerRequest,
  type PagesExtractWorkerRequest,
  type PagesInsertBlankWorkerRequest,
  type PagesInsertWorkerRequest,
  type AttachmentsListWorkerRequest,
  type AttachmentsReadFileWorkerRequest,
  type AttachmentsCreateWorkerRequest,
  type AttachmentsDeleteWorkerRequest,
  type AnnotationsReadFileWorkerRequest,
  type AnnotationsReadAppearanceWorkerRequest,
  type AnnotationsExportWorkerRequest,
  type AnnotationsImportWorkerRequest,
  type PagesFlattenWorkerRequest,
  type RedactionApplyWorkerRequest,
  type PieceInfoApplicationsWorkerRequest,
  type PieceInfoDeleteWorkerRequest,
  type PieceInfoReadWorkerRequest,
  type PieceInfoUpdateWorkerRequest,
  type PageNetworkRenderFormat,
  type PageRaster,
  type PagesRenderWorkerRequest,
  type EncodedAppearanceWire,
  type EncodedImageWire,
  type RenderEncode,
  type PagesTextWorkerRequest,
  type SearchQueryWorkerRequest,
  type FormsApplyEffectsWorkerRequest,
  type PageRef,
  type PagesWorkingSetWorkerRequest,
  type RequestEffect,
  type SerializedEngineError,
  type ShutdownWorkerRequest,
  type WirePack,
  type WorkerJobId,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerResultPayload,
  type PdfCoordinates,
  type VisibleBoxOf,
  type LayerArtifactFileWorkerPayload,
  type LayerArtifactWorkerPayload,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import {
  renderOptionsInFileSpace,
  requestInFileSpace,
  resultInPageSpace,
  type FileSpaceJob,
  type PageSpaceJob,
} from './pageSpaceBoundary';
import { DocumentSession } from '../document-session/DocumentSession';
import { BaseDocumentRegistry } from '../document-session/lifecycle/BaseDocumentRegistry';
import { openLayerDocument } from '../document-session/lifecycle/PdfDocumentOpener';
import { DecodedImageStore } from '../document-session/pages/DecodedImageStore';
import {
  DEFAULT_PAGE_RESIDENCY_POLICY,
  PageResidency,
} from '../document-session/pages/PageResidency';
import { DocumentActionsReader } from '../features/actions';
import {
  AnnotationAppearanceReader,
  AnnotationExporter,
  AnnotationImporter,
  AnnotationFlattener,
  AnnotationMutator,
  RawAnnotationReader,
} from '../features/annotations';
import { AttachmentMutator, AttachmentReader } from '../features/attachments';
import { FontRegistrar, type StartupFontSpec } from '../features/fonts';
import { FormMutator, FormReader, FormsEffectsApplier, disposeFormModel } from '../features/forms';
import { formMutationMeta } from '../features/forms/internal/formMutationMeta';
import { PageGeometryReader } from '../features/geometry';
import { MeasureReader, MeasureMutator } from '../features/measure';
import { MetadataMutator, MetadataReader } from '../features/metadata';
import {
  PagesExtractor,
  PagesFlattener,
  PagesInserter,
  PagesMutator,
  PagesReader,
  visibleBoxReader,
} from '../features/pages';
import { PieceInfoAccessor } from '../features/pieceinfo';
import { RedactionApplier } from '../features/redaction';
import { PageRenderReader } from '../features/render';
import { DocumentSaver } from '../features/save';
import { SearchReader } from '../features/search';
import { SecurityReader } from '../features/security';
import {
  CandidateFinalizer,
  SignatureAnalyzer,
  SignatureMutator,
  SignatureReader,
  disposeSignatureModel,
} from '../features/signature';
import { PageTextReader } from '../features/text';
import { ensureInitialized, destroyLibrary } from '../runtime/lifecycle/bootstrap';
import type { Slices } from '../shared/slices';
import { generateUuid } from '../shared/uuid';
import { createEventLoopYield } from '../shared/yield';

/** The image a {@link WorkerImageEncoder} produced. `bytes` must own its
 *  buffer (a fresh allocation, not a pooled `Buffer` slab view) — it is
 *  placed on the transfer manifest and moved zero-copy. */
export interface WorkerEncodedImage {
  contentType: string;
  bytes: Uint8Array;
}

/**
 * Injected image-encode capability for the `*.renderEncoded` wire kinds.
 * Dependency inversion keeps the native encoder out of this shared
 * package: the cloud server's worker entry injects a sharp/libvips
 * implementation; browser/local entries inject nothing (they encode via
 * canvas) and the encoded kinds reject with `NotImplemented`.
 */
export interface WorkerImageEncoder {
  encode(
    raster: PageRaster,
    opts: { format: PageNetworkRenderFormat; quality?: number },
  ): Promise<WorkerEncodedImage>;
}

export interface WorkerHostOptions {
  imageEncoder?: WorkerImageEncoder;
  /**
   * Where a file-backed session (a file base) writes its signing candidate
   * between `prepare` and `complete`. Defaults to beside the base file
   * (`<base>.signing-<id>.pdf`); a server maps it into its storage layout so
   * the sealed file can be published by rename.
   */
  signingCandidatePath?: (basePath: string, signingId: string) => string;
  /**
   * Bytes of decoded images kept between jobs that write nothing (see
   * {@link DecodedImageStore}). Defaults to 128 MB; 0 keeps none.
   */
  decodedImageBudgetBytes?: number;
  /**
   * Bytes of parsed pages kept between jobs, for every document on this
   * thread (see {@link PageResidency}). Defaults to
   * {@link DEFAULT_PAGE_RESIDENCY_POLICY}'s; 0 keeps none.
   */
  parsedPageBudgetBytes?: number;
  /**
   * Milliseconds a job's PDFium work runs (a page render, a page load, a loop
   * over glyphs or annotations) before it lets this thread receive messages,
   * so an abort stops it about this soon. Defaults to {@link DEFAULT_SLICE_MS}.
   */
  sliceMs?: number;
}

/** See {@link WorkerHostOptions.sliceMs}. */
export const DEFAULT_SLICE_MS = 8;

/**
 * The work of a job that pauses between slices (see {@link WorkerHost.runSliced}):
 * its PDFium part, and for an encoded kind the image encode that follows it.
 */
interface SlicedWork {
  pdfium(signal: AbortSignal): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>>;
  encode?(
    pdfium: WirePack<WorkerResultPayload<PdfCoordinates>>,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>>;
}

/** A page render as it arrives, in page space: what the held list reorders. */
type HeldPageRender = Extract<
  PageSpaceJob,
  {
    kind:
      | 'pages.render'
      | 'pages.renderEncoded'
      | 'document.renderPageFile'
      | 'document.renderPageFileEncoded';
  }
>;

function isPageRender(job: PageSpaceJob): job is HeldPageRender {
  return (
    job.kind === 'pages.render' ||
    job.kind === 'pages.renderEncoded' ||
    job.kind === 'document.renderPageFile' ||
    job.kind === 'document.renderPageFileEncoded'
  );
}

/**
 * The piece that runs "inside the worker": owns runtime, manages document
 * sessions, dispatches requests to the engine-services synchronous code.
 *
 * Environment-agnostic. Wrap it with a Web Worker entry, a Node
 * worker_thread entry, or an inline transport. The wrapper owns
 * postMessage plumbing and any process/lifecycle concerns; the host only
 * knows about PdfRuntimeModule, DocumentSession, AbortController, and the
 * worker wire shape from @embedpdf/engine-core.
 */
export class WorkerHost {
  private readonly sessions = new Map<string, DocumentSession>();
  private readonly baseDocuments: BaseDocumentRegistry;
  private readonly aborts = new Map<WorkerJobId, AbortController>();
  /**
   * Runtime-global registered fonts for this thread. The registry is
   * thread-local in PDFium, so it lives on the host (one per thread), not per
   * document session. `fontIds` maps the stable wire `fontKey` to this
   * thread's volatile native FontId.
   */
  private readonly fontIds = new Map<string, number>();
  private readonly fonts: FontRegistrar;
  /** Parsed pages kept between jobs, for every session on this runtime. */
  private readonly residency: PageResidency;
  /** Image decodes kept between jobs that write nothing, for every session on this runtime. */
  private readonly decodedImages: DecodedImageStore;
  private readonly slices: Slices;
  /**
   * True while a job's PDFium work is in progress across slices (a render, a
   * page load, a glyph loop). It pauses between slices so this thread can
   * receive an abort, but nothing else may use PDFium meanwhile (a render
   * holds its page until it ends): requests that arrive are held (see
   * {@link receive}).
   */
  private busy = false;
  /** Requests that arrived while a job was busy, in arrival order (see {@link takeHeld}). */
  private readonly held: PageSpaceJob[] = [];
  private destroyed = false;

  constructor(
    private readonly runtime: PdfRuntimeModule,
    /**
     * Receives a fully-typed `WirePack<WorkerResponse>` (the envelope
     * payload plus its transfer manifest). The wrapper (browser
     * `worker-entry.ts`, Node `worker-entry.ts`, or `InlineTransport`)
     * is responsible for actually invoking `postMessage(pack.payload,
     * pack.transfer)` — the host doesn't know which environment it
     * runs in.
     */
    private readonly post: (pack: WirePack<WorkerResponse>) => void,
    /** Optional capabilities. See {@link WorkerHostOptions}. */
    private readonly options: WorkerHostOptions = {},
  ) {
    ensureInitialized(this.runtime);
    this.baseDocuments = new BaseDocumentRegistry(this.runtime);
    this.fonts = new FontRegistrar(this.runtime, this.fontIds);
    this.residency = new PageResidency(
      this.runtime,
      {
        ...DEFAULT_PAGE_RESIDENCY_POLICY,
        budgetBytes:
          this.options.parsedPageBudgetBytes ?? DEFAULT_PAGE_RESIDENCY_POLICY.budgetBytes,
      },
      () => this.busy,
    );
    this.decodedImages = new DecodedImageStore(this.runtime, this.options.decodedImageBudgetBytes);
    this.slices = {
      budgetMs: this.options.sliceMs ?? DEFAULT_SLICE_MS,
      between: createEventLoopYield(),
    };
  }

  /**
   * Register deployment-owned fonts on this worker thread, after init and
   * before serving requests. Server-only: the cloud engine never exposes font
   * configuration to clients, so the host (not a wire message) seeds the
   * thread's fallback fonts. Browser engines drive fonts through the
   * `fonts.*` wire path instead. Throws if any font fails to load.
   */
  registerStartupFonts(specs: readonly StartupFontSpec[]): void {
    this.fonts.registerStartup(specs);
  }

  receive(msg: WorkerRequest): void {
    if (msg.kind === 'abort') {
      this.abort(msg.jobId);
      return;
    }
    // Bookkeeping only, so it is taken at once, even while a render runs.
    if (msg.kind === 'pages.workingSet') {
      this.setWorkingSet(msg);
      return;
    }
    // While a job is busy, and until every request held meanwhile has run,
    // requests wait their turn in arrival order.
    if (this.busy || this.held.length > 0) {
      this.held.push(msg);
      return;
    }
    this.run(msg);
  }

  /** What a view shows of a document: the order its kept pages close in. Never answered. */
  private setWorkingSet(msg: PagesWorkingSetWorkerRequest): void {
    const session = this.sessions.get(sessionKey(msg.docId, msg.layerName));
    if (!session?.isOpen()) return;
    session.pagePool().setWorkingSet(
      msg.view,
      msg.pages.map(({ page, role, pixels }) => ({
        pageObjectNumber: page.objectNumber,
        role,
        pixels,
      })),
    );
  }

  /** Stops a running job, or answers a held one as aborted without running it. */
  private abort(jobId: WorkerJobId): void {
    const index = this.held.findIndex((msg) => msg.jobId === jobId);
    if (index < 0) {
      this.aborts.get(jobId)?.abort();
      return;
    }
    this.held.splice(index, 1);
    const error = serializeError(new AbortError('aborted before it ran'));
    this.post(wirePack({ kind: 'reject', jobId, error }, EMPTY_TRANSFER));
  }

  /** Runs held requests until one is busy across slices. */
  private drain(): void {
    while (!this.busy) {
      const next = this.takeHeld();
      if (!next) return;
      this.run(next);
    }
  }

  /**
   * The next held request. Requests run in arrival order, except that of page
   * renders held one after another, a render whose page is parsed runs before
   * one that must parse it. A render never passes another kind of request, nor
   * the other way round.
   */
  private takeHeld(): PageSpaceJob | undefined {
    const first = this.held[0];
    if (!first || !isPageRender(first)) return this.held.shift();
    let next = 0;
    let best = first;
    for (let i = 1; i < this.held.length; i++) {
      const candidate = this.held[i]!;
      if (!isPageRender(candidate)) break;
      if (this.pageIsKept(candidate) && !this.pageIsKept(best)) {
        next = i;
        best = candidate;
      }
    }
    this.held.splice(next, 1);
    return best;
  }

  /** Whether the render's page is kept, so the render parses nothing. */
  private pageIsKept(msg: HeldPageRender): boolean {
    if (!('docId' in msg)) return false;
    const session = this.sessions.get(sessionKey(msg.docId, msg.layerName));
    if (!session) return false;
    try {
      return session.pagePool().isKept(session.resolvePageRef(msg.page).pageObjectNumber);
    } catch {
      // No such page: the render fails when it runs, at its place in line.
      return false;
    }
  }

  private run(job: PageSpaceJob): void {
    // Before any route below: a write drops every kept image decode, and a
    // write that changes content closes the pages it may change, so no change
    // can meet a page or an image decoded before it (see pageEffectOf).
    const effect = pageEffectOf(job);
    this.closePagesChangedBy(job, effect);
    this.decodedImages.beginJob(effect === 'none');

    // The handlers work in the file's coordinates: the places a caller sent
    // convert here, as the job runs.
    let msg: FileSpaceJob;
    try {
      msg = requestInFileSpace(job, this.visibleBoxesFor(job));
    } catch (err) {
      this.post(
        wirePack({ kind: 'reject', jobId: job.jobId, error: serializeError(err) }, EMPTY_TRANSFER),
      );
      return;
    }

    // Renders and the reads that load pages pause between slices (see
    // runSliced); everything else runs in one go, on the switch below.
    const sliced = this.slicedWork(msg);
    if (sliced) {
      void this.runSliced(job, msg, effect, sliced);
      return;
    }

    const ctrl = new AbortController();
    this.aborts.set(msg.jobId, ctrl);

    // Abort policy: only handlers that loop over pages/annotations honor
    // `ctrl.signal` (the read/mutation paths below). One-shot native
    // operations — open, document save, security probe, close, shutdown —
    // are effectively atomic from our side and intentionally non-abortable,
    // so they do not receive the signal.
    let resultPack: WirePack<WorkerResultPayload<PdfCoordinates>>;
    // A write runs as one layer transaction: it commits in finishMutation,
    // before the layer is saved, or below when the write had nothing to do,
    // and any throw before then aborts it, leaving the document as it was.
    const transacted = this.transactedSession(msg);
    try {
      // A parked signing candidate freezes the session: every mutating kind
      // is refused at dispatch, before any native write, until the signing
      // completes or is cancelled. Reads keep seeing the live document, which the
      // candidate never changed.
      this.assertNoPendingSigning(msg);
      transacted?.beginTransaction();
      // The write's own objects go at or above the floor its caller set.
      if (transacted && 'objectNumberFloor' in msg && msg.objectNumberFloor !== undefined) {
        transacted.raiseLastObjectNumber(msg.objectNumberFloor - 1);
      }
      switch (msg.kind) {
        case 'open.fatMem':
        case 'open.layerMemBase':
        case 'open.layerFileBase':
          resultPack = this.handleOpen(msg);
          break;
        case 'metadata.read':
          resultPack = this.handleMetadataRead(msg, ctrl.signal);
          break;
        case 'metadata.update':
          resultPack = this.handleMetadataUpdate(msg, ctrl.signal);
          break;
        case 'metadata.readCustom':
          resultPack = this.handleMetadataReadCustom(msg, ctrl.signal);
          break;
        case 'metadata.updateCustom':
          resultPack = this.handleMetadataUpdateCustom(msg, ctrl.signal);
          break;
        case 'actions.read':
          resultPack = this.handleActionsRead(msg, ctrl.signal);
          break;
        case 'annotations.list':
          resultPack = this.handleAnnotationsList(msg, ctrl.signal);
          break;
        case 'annotations.create':
          resultPack = this.handleAnnotationsCreate(msg, ctrl.signal);
          break;
        case 'annotations.update':
          resultPack = this.handleAnnotationsUpdate(msg, ctrl.signal);
          break;
        case 'annotations.delete':
          resultPack = this.handleAnnotationsDelete(msg, ctrl.signal);
          break;
        case 'annotations.move':
          resultPack = this.handleAnnotationsMove(msg, ctrl.signal);
          break;
        case 'signatures.list':
          resultPack = this.handleSignaturesList(msg);
          break;
        case 'signatures.contents':
          resultPack = this.handleSignaturesContents(msg);
          break;
        case 'signatures.digest':
          resultPack = this.handleSignaturesDigest(msg);
          break;
        case 'signatures.revisionBytes':
          resultPack = this.handleSignaturesRevisionBytes(msg);
          break;
        case 'document.version':
          resultPack = this.handleDocumentVersion(msg);
          break;
        case 'signatures.prepare':
          resultPack = this.handleSignaturesPrepare(msg);
          break;
        case 'signatures.complete':
          resultPack = this.handleSignaturesComplete(msg);
          break;
        case 'signatures.cancel':
          resultPack = this.handleSignaturesCancel(msg);
          break;
        case 'signatures.analyze':
          resultPack = this.handleSignaturesAnalyze(msg);
          break;
        case 'signatures.finalizeCandidate':
          resultPack = this.handleSignaturesFinalizeCandidate(msg);
          break;
        case 'forms.list':
          resultPack = this.handleFormsList(msg, ctrl.signal);
          break;
        case 'forms.setValue':
          resultPack = this.handleFormsSetValue(msg, ctrl.signal);
          break;
        case 'forms.reset':
          resultPack = this.handleFormsReset(msg, ctrl.signal);
          break;
        case 'forms.applyEffects':
          resultPack = this.handleFormsApplyEffects(msg, ctrl.signal);
          break;
        case 'forms.export':
          resultPack = this.handleFormsExport(msg, ctrl.signal);
          break;
        case 'forms.import':
          resultPack = this.handleFormsImport(msg, ctrl.signal);
          break;
        case 'forms.repair':
          resultPack = this.handleFormsRepair(msg, ctrl.signal);
          break;
        case 'forms.createField':
          resultPack = this.handleFormsCreateField(msg, ctrl.signal);
          break;
        case 'forms.updateField':
          resultPack = this.handleFormsUpdateField(msg, ctrl.signal);
          break;
        case 'forms.setSignatureAppearance':
          resultPack = this.handleFormsSetSignatureAppearance(msg, ctrl.signal);
          break;
        case 'forms.deleteField':
          resultPack = this.handleFormsDeleteField(msg, ctrl.signal);
          break;
        case 'forms.addWidget':
          resultPack = this.handleFormsAddWidget(msg, ctrl.signal);
          break;
        case 'forms.detachWidget':
          resultPack = this.handleFormsDetachWidget(msg, ctrl.signal);
          break;
        case 'pages.list':
          resultPack = this.handlePagesList(msg, ctrl.signal);
          break;
        case 'pages.move':
          resultPack = this.handlePagesMove(msg, ctrl.signal);
          break;
        case 'pages.rotate':
          resultPack = this.handlePagesRotate(msg, ctrl.signal);
          break;
        case 'pages.delete':
          resultPack = this.handlePagesDelete(msg, ctrl.signal);
          break;
        case 'pages.setName':
          resultPack = this.handlePagesSetName(msg, ctrl.signal);
          break;
        case 'annotations.flatten':
          resultPack = this.handleAnnotationsFlatten(msg, ctrl.signal);
          break;
        case 'annotations.exportAppearance':
          resultPack = this.handleAnnotationsExportAppearance(msg, ctrl.signal);
          break;
        case 'annotations.readAppearance':
          resultPack = this.handleAnnotationsReadAppearance(msg, ctrl.signal);
          break;
        case 'annotations.export':
          resultPack = this.handleAnnotationsExport(msg, ctrl.signal);
          break;
        case 'annotations.import':
          resultPack = this.handleAnnotationsImport(msg, ctrl.signal);
          break;
        case 'pages.removeName':
          resultPack = this.handlePagesRemoveName(msg, ctrl.signal);
          break;
        case 'pages.flatten':
          resultPack = this.handlePagesFlatten(msg, ctrl.signal);
          break;
        case 'redaction.apply':
          resultPack = this.handleRedactionApply(msg, ctrl.signal);
          break;
        case 'pages.extract':
          resultPack = this.handlePagesExtract(msg, ctrl.signal);
          break;
        case 'pages.insert':
          resultPack = this.handlePagesInsert(msg, ctrl.signal);
          break;
        case 'pages.insertBlank':
          resultPack = this.handlePagesInsertBlank(msg, ctrl.signal);
          break;
        case 'attachments.list':
          resultPack = this.handleAttachmentsList(msg, ctrl.signal);
          break;
        case 'attachments.readFile':
          resultPack = this.handleAttachmentsReadFile(msg, ctrl.signal);
          break;
        case 'attachments.create':
          resultPack = this.handleAttachmentsCreate(msg, ctrl.signal);
          break;
        case 'attachments.delete':
          resultPack = this.handleAttachmentsDelete(msg, ctrl.signal);
          break;
        case 'measure.setScale':
          resultPack = this.handleMeasureSetScale(msg, ctrl.signal);
          break;
        case 'pieceInfo.read':
          resultPack = this.handlePieceInfoRead(msg, ctrl.signal);
          break;
        case 'pieceInfo.update':
          resultPack = this.handlePieceInfoUpdate(msg, ctrl.signal);
          break;
        case 'pieceInfo.applications':
          resultPack = this.handlePieceInfoApplications(msg, ctrl.signal);
          break;
        case 'pieceInfo.delete':
          resultPack = this.handlePieceInfoDelete(msg, ctrl.signal);
          break;
        case 'document.saveBuffer':
          resultPack = this.handleDocumentSaveBuffer(msg);
          break;
        case 'document.saveLayerBuffer':
          resultPack = this.handleDocumentSaveLayerBuffer(msg);
          break;
        case 'document.saveFile':
          resultPack = this.handleDocumentSaveFile(msg);
          break;
        case 'document.probeSecurityFile':
          resultPack = this.handleDocumentProbeSecurityFile(msg);
          break;
        case 'document.checkPasswordPermissions':
          resultPack = this.handleDocumentCheckPasswordPermissions(msg);
          break;
        case 'fonts.register':
          resultPack = this.handleFontsRegister(msg);
          break;
        case 'fonts.addFallback':
          resultPack = this.handleFontsAddFallback(msg);
          break;
        case 'fonts.clearFallbacks':
          resultPack = this.handleFontsClearFallbacks(msg);
          break;
        case 'fonts.clear':
          resultPack = this.handleFontsClear(msg);
          break;
        case 'fonts.authorizeEditing':
          resultPack = this.handleFontsAuthorizeEditing(msg);
          break;
        case 'document.setFontSettings':
          resultPack = this.handleDocumentSetFontSettings(msg);
          break;
        case 'objectNumbers.reserve':
          resultPack = wirePack({
            tag: 'objectNumbers.reserve',
            range: this.requireSession(msg).reserveObjectNumbers(msg.count),
          });
          break;
        case 'layer.close':
          resultPack = this.handleLayerClose(msg);
          break;
        case 'close':
          resultPack = this.handleClose(msg);
          break;
        case 'shutdown':
          resultPack = this.handleShutdown(msg);
          break;
        default:
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            `unknown request kind: ${(msg as WorkerRequest).kind}`,
          );
      }
      if (transacted?.inTransaction()) transacted.commitTransaction();
      this.resolve(msg, resultPack);
    } catch (err) {
      if (transacted?.inTransaction()) transacted.abortTransaction();
      const error: SerializedEngineError = serializeError(err);
      // Reject envelopes never carry binary; explicit EMPTY_TRANSFER
      // documents that intent.
      this.post(wirePack({ kind: 'reject', jobId: msg.jobId, error }, EMPTY_TRANSFER));
    } finally {
      this.aborts.delete(msg.jobId);
      // And after it: the pages the write itself released, done or failed.
      this.closePagesChangedBy(job, effect);
    }
  }

  /**
   * The session a job writes to, when it runs as a transaction: a write to an
   * open, usable layer document. Anything else (no such session, a locked
   * one) gets its handler's own error.
   */
  private transactedSession(msg: FileSpaceJob): DocumentSession | undefined {
    if (!writesDocument(msg)) return undefined;
    const layerName = 'layerName' in msg ? msg.layerName : undefined;
    const session = this.sessions.get(sessionKey(msg.docId, layerName));
    if (!session?.isOpen() || session.kind !== 'layer') return undefined;
    session.assertUsable();
    return session;
  }

  /** Closes the pages a job of this effect may change, as no job holds them. */
  private closePagesChangedBy(job: PageSpaceJob, effect: PageEffect): void {
    if (effect === 'runtime') {
      this.residency.closeIdle();
      return;
    }
    if (effect !== 'document' || !('docId' in job)) return;
    const layerName = 'layerName' in job ? job.layerName : undefined;
    this.sessions.get(sessionKey(job.docId, layerName))?.pagePool().closeIdle();
  }

  /**
   * Answers a job with its result in page space. The handler decided which
   * buffers to move; the host relays that decision on the `resolve` envelope.
   */
  private resolve(msg: FileSpaceJob, pack: WirePack<WorkerResultPayload<PdfCoordinates>>): void {
    const result = resultInPageSpace(pack.payload, this.visibleBoxesFor(msg));
    this.post(wirePack({ kind: 'resolve', jobId: msg.jobId, result }, pack.transfer));
  }

  /** The visible boxes of the request's document, read only when a result asks for one. */
  private visibleBoxesFor(msg: PageSpaceJob | FileSpaceJob): VisibleBoxOf {
    let read: VisibleBoxOf | null = null;
    return (page) => {
      if (!('docId' in msg)) {
        throw new EngineError(EngineErrorCode.InvalidArg, `${msg.kind} has no document`);
      }
      read ??= visibleBoxReader(this.runtime, this.requireSession(msg));
      return read(page);
    };
  }

  private handleOpen(req: OpenWorkerRequest): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const key = sessionKey(req.docId, req.kind === 'open.fatMem' ? undefined : req.layerName);
    if (this.sessions.has(key)) {
      throw new EngineError(EngineErrorCode.InvalidArg, `document session already open: ${key}`);
    }
    const session = new DocumentSession(this.runtime);
    session.residency = this.residency;
    session.signedDocumentPolicy = req.signedDocumentPolicy ?? 'protect';
    session.password = req.password;
    session.objectNumberAuthority = req.objectNumbers ?? 'session';
    // Every input kind loads the same way with or without a password, so a
    // locked file parks and unlocks the same way whatever it came from.
    let load: (password: string | null) => void;
    if (req.kind === 'open.fatMem') {
      const bytes = new Uint8Array(req.bytes);
      load = (password) => this.openBytesAsLayer(session, bytes, password);
    } else if (req.kind === 'open.layerMemBase') {
      const baseBytes = new Uint8Array(req.baseBytes);
      load = (password) => {
        const base = this.baseDocuments.acquireMemoryBase({
          key: req.baseKey,
          bytes: baseBytes,
          password,
          knownSha256: req.baseSha256,
        });
        session.openFromHandle(openLayerDocument(this.runtime, base, req.layer, password));
      };
    } else {
      // A base read from disk needs the native runtime's file access.
      if (this.runtime.kind !== 'native') {
        throw new EngineError(
          EngineErrorCode.NotImplemented,
          "'layerFile' needs the native Node runtime; open the file's bytes instead",
        );
      }
      load = (password) => {
        const base = this.baseDocuments.acquireFileBase({
          key: req.baseKey,
          path: req.basePath,
          password,
          knownSha256: req.baseSha256,
        });
        session.openFromHandle(openLayerDocument(this.runtime, base, req.layer, password));
      };
    }
    try {
      load(req.password);
    } catch (error) {
      // A password failure is a state, not an error: park the session and
      // answer with a security probe that says "password required". The
      // client handle comes up locked (`security.passwordPrompt` is
      // `'required'`, `incorrect` when a password was given and wrong); a
      // later `document.checkPasswordPermissions` performs the actual load.
      if (!isPasswordOpenError(error)) throw error;
      session.parkLocked(load);
      this.sessions.set(key, session);
      return wirePack({
        tag: 'open',
        docId: req.docId,
        security: passwordRequiredProbe(),
        ...(req.password ? { passwordRejected: true } : {}),
      });
    }
    this.sessions.set(key, session);
    return wirePack({
      tag: 'open',
      docId: req.docId,
      security: new SecurityReader(this.runtime).checkPasswordPermissions(
        session,
        req.password ?? '',
      ),
      protection: this.probeProtection(session),
      ...(req.reserveObjectNumbers
        ? { objectNumbers: session.reserveObjectNumbers(req.reserveObjectNumbers) }
        : {}),
      lastObjectNumber: session.lastObjectNumber(),
    });
  }

  /**
   * Open bytes into `session` as an immutable base with a fresh layer on top:
   * reads fall through to the base, a write promotes only what it touches and
   * runs as a layer transaction, a save appends exactly that, and a signature
   * keeps its validity across later edits because the signature dictionary is
   * never rewritten. The session serializes no artifact per mutation: the
   * caller holds the document, not a layer.
   */
  private openBytesAsLayer(
    session: DocumentSession,
    bytes: Uint8Array,
    password: string | null,
  ): void {
    // The base registry reports a password failure the way a plain open
    // does, so a locked document parks and unlocks the same way.
    const base = this.baseDocuments.acquireMemoryBase({
      key: `bytes-open:${generateUuid()}`,
      bytes,
      password,
    });
    session.openFromHandle(openLayerDocument(this.runtime, base, { kind: 'fresh' }, password));
    session.persistLayerArtifact = false;
  }

  /**
   * What the document's signatures forbid, read at open and after an
   * unlock so the main-thread guard can subtract capabilities before the
   * first mutation. A document whose signature model cannot be built
   * still opens: protection is then `null` (nothing is known to be
   * signed), and the reads report the failure on their own.
   */
  private probeProtection(session: DocumentSession): DocumentProtection | null {
    try {
      return new SignatureReader(this.runtime, session).readProtection();
    } catch {
      return null;
    }
  }

  private handleSignaturesList(
    req: SignaturesListWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const snapshot = req.workingCopy
      ? new SignatureAnalyzer(this.runtime, session).readWorkingCopySnapshot()
      : new SignatureReader(this.runtime, session).readSnapshot();
    return wirePack({ tag: 'signatures.list', snapshot });
  }

  private handleSignaturesContents(
    req: SignaturesContentsWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const bytes = new SignatureReader(this.runtime, session).readContents(req.ref);
    return wirePack({ tag: 'signatures.contents', bytes }, [bytes]);
  }

  private handleSignaturesDigest(
    req: SignaturesDigestWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const digest = new SignatureReader(this.runtime, session).digest(req.ref, req.algorithm);
    return wirePack({ tag: 'signatures.digest', digest }, [digest]);
  }

  private handleSignaturesRevisionBytes(
    req: SignaturesRevisionBytesWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const bytes = new SignatureReader(this.runtime, session).revisionBytes(req.revisionIndex);
    return wirePack({ tag: 'signatures.revisionBytes', bytes, size: bytes.byteLength }, [bytes]);
  }

  private handleDocumentVersion(
    req: DocumentVersionWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const version = new SignatureReader(this.runtime, session).version();
    return wirePack({ tag: 'document.version', version });
  }

  private handleSignaturesPrepare(
    req: SignaturesPrepareWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    // The live document is untouched: no mutation, no artifact.
    const result = new SignatureMutator(
      this.runtime,
      session,
      this.baseDocuments,
      this.options.signingCandidatePath,
    ).prepare(req.input);
    return wirePack({ tag: 'signatures.prepare', result });
  }

  private handleSignaturesComplete(
    req: SignaturesCompleteWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const result = new SignatureMutator(
      this.runtime,
      session,
      this.baseDocuments,
      this.options.signingCandidatePath,
    ).complete(req.input);
    if (result.status === 'already-completed') {
      return wirePack({ tag: 'signatures.complete', result });
    }
    // The install already advanced the mutation sequence; finishMutation
    // only adds the (now empty) layer artifact for layer sessions.
    return this.finishMutation(session, { tag: 'signatures.complete', result }, req.artifactPath);
  }

  private handleSignaturesAnalyze(
    req: SignaturesAnalyzeWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const analysis = new SignatureAnalyzer(this.runtime, session).analyze(req.input);
    return wirePack({ tag: 'signatures.analyze', analysis });
  }

  /**
   * Session-less, like `document.renderPageFile`: the candidate file is
   * the caller's, patched in place and read back through a transient
   * session that is never stored in `this.sessions`.
   */
  private handleSignaturesFinalizeCandidate(
    req: SignaturesFinalizeCandidateWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const finalized = new CandidateFinalizer(this.runtime, this.baseDocuments).finalize({
      path: req.path,
      byteRange: req.byteRange,
      contentsSize: req.contentsSize,
      fieldObjectNumber: req.fieldObjectNumber,
      cms: new Uint8Array(req.cms),
      password: req.password ?? null,
    });
    return wirePack({ tag: 'signatures.finalizeCandidate', ...finalized });
  }

  private handleSignaturesCancel(
    req: SignaturesCancelWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const result = new SignatureMutator(
      this.runtime,
      session,
      this.baseDocuments,
      this.options.signingCandidatePath,
    ).cancel(req.signingId);
    return wirePack({ tag: 'signatures.cancel', result });
  }

  /**
   * The dispatch fence for a parked signing candidate. Only writes are
   * refused, except the signing's own completion; a request for a session
   * that is not open falls through to its handler's own `DocNotOpen`.
   */
  private assertNoPendingSigning(msg: FileSpaceJob): void {
    if (!writesDocument(msg)) return;
    const layerName = 'layerName' in msg ? msg.layerName : undefined;
    const session = this.sessions.get(sessionKey(msg.docId, layerName));
    if (session?.pendingSigning) {
      throw new EngineError(
        EngineErrorCode.SigningPending,
        `a signing is pending (${session.pendingSigning.prepared.signingId}); complete or cancel it before mutating the document`,
      );
    }
  }

  private handleMetadataRead(
    req: MetadataReadWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const metadata = new MetadataReader(this.runtime, session).read(signal);
    return wirePack({ tag: 'metadata.read', metadata });
  }

  private handleMetadataUpdate(
    req: MetadataUpdateWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new MetadataMutator(this.runtime, session);
    const result = mutator.update(req.patch, signal);
    return this.finishMutation(session, { tag: 'metadata.update', result }, req.artifactPath);
  }

  private handleMetadataReadCustom(
    req: MetadataReadCustomWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const custom = new MetadataReader(this.runtime, session).readCustom(signal);
    return wirePack({ tag: 'metadata.readCustom', custom });
  }

  private handleMetadataUpdateCustom(
    req: MetadataUpdateCustomWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new MetadataMutator(this.runtime, session);
    const result = mutator.updateCustom(req.patch, signal);
    return this.finishMutation(session, { tag: 'metadata.updateCustom', result }, req.artifactPath);
  }

  private handleActionsRead(
    req: ActionsReadWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const snapshot = new DocumentActionsReader(this.runtime, session).read(signal);
    return wirePack({ tag: 'actions.read', snapshot });
  }

  private handleAnnotationsList(
    req: AnnotationsListWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const pages = req.pages?.map((page) => session.resolvePageRef(page).pageObjectNumber);
    const reader = new RawAnnotationReader(this.runtime, session, this.fonts);
    return wirePack({ tag: 'annotations.list', list: reader.list(pages, signal) });
  }

  private async handleAnnotationsRenderAppearances(
    req: AnnotationsRenderAppearancesWorkerRequest,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>> {
    const session = this.requireSession(req);
    const pageObjectNumber = session.resolvePageRef(req.page).pageObjectNumber;
    const reader = new AnnotationAppearanceReader(this.runtime, session);
    const result = await reader.render(pageObjectNumber, req.options ?? {}, signal, this.slices);
    // Transfer every appearance raster buffer back zero-copy, like pages.render.
    const transfer = result.appearances.map((a) => a.raster.data);
    return wirePack({ tag: 'annotations.renderAppearances', page: req.page, result }, transfer);
  }

  private handleAnnotationsCreate(
    req: AnnotationsCreateWorkerRequest<PdfCoordinates>,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const pageObjectNumber = session.resolvePageRef(req.page).pageObjectNumber;
    const mutator = new AnnotationMutator(this.runtime, session, this.fonts);
    const result = mutator.create(pageObjectNumber, req.draft, signal, {
      ...(req.actor ? { actor: req.actor } : {}),
      ...(req.resources ? { resources: req.resources } : {}),
      ...(req.objectNumber !== undefined ? { objectNumber: req.objectNumber } : {}),
    });
    return this.finishMutation(session, { tag: 'annotations.create', result }, req.artifactPath);
  }

  private handleAnnotationsUpdate(
    req: AnnotationsUpdateWorkerRequest<PdfCoordinates>,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new AnnotationMutator(this.runtime, session, this.fonts);
    const result = mutator.update(req.ref, req.patch, req.authority, signal, req.resources);
    return this.finishMutation(session, { tag: 'annotations.update', result }, req.artifactPath);
  }

  private handleAnnotationsDelete(
    req: AnnotationsDeleteWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new AnnotationMutator(this.runtime, session, this.fonts);
    const result = mutator.delete(req.ref, req.authority, signal);
    return this.finishMutation(session, { tag: 'annotations.delete', result }, req.artifactPath);
  }

  private handleAnnotationsFlatten(
    req: AnnotationsFlattenWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const pageObjectNumber = session.resolvePageRef(req.page).pageObjectNumber;
    const result = new AnnotationFlattener(this.runtime, session).flatten(
      pageObjectNumber,
      req.refs,
      req.usage,
      signal,
    );
    // A write always names its pages; applying nothing names none.
    const wrote = result.meta.affectedPages.length > 0;
    if (!wrote) return wirePack({ tag: 'annotations.flatten', result, wrote });
    return this.finishMutation(
      session,
      { tag: 'annotations.flatten', result, wrote },
      req.artifactPath,
    );
  }

  private handleAnnotationsExportAppearance(
    req: AnnotationsExportAppearanceWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const pageObjectNumber = session.resolvePageRef(req.page).pageObjectNumber;
    const exported = new AnnotationFlattener(this.runtime, session).exportAppearance(
      pageObjectNumber,
      req.refs,
      signal,
    );
    // A read: no finishMutation, no layer artifact. Bytes transfer zero-copy.
    return wirePack(
      { tag: 'annotations.exportAppearance', bytes: exported.bytes, size: exported.size },
      [exported.bytes],
    );
  }

  private handleAnnotationsExport(
    req: AnnotationsExportWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const bundle = new AnnotationExporter(this.runtime, session, this.fonts).export(
      req.selection,
      req.limits ?? DEFAULT_ANNOTATION_BUNDLE_LIMITS,
      signal,
    );
    return wirePack({ tag: 'annotations.export', bundle }, Object.values(bundle.resources));
  }

  private handleAnnotationsImport(
    req: AnnotationsImportWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const result = new AnnotationImporter(this.runtime, session, this.fonts).import(
      { ...req, limits: req.limits ?? DEFAULT_ANNOTATION_BUNDLE_LIMITS },
      signal,
    );
    // Everything left out: nothing was written.
    if (result.annotations.length === 0) return wirePack({ tag: 'annotations.import', result });
    return this.finishMutation(session, { tag: 'annotations.import', result }, req.artifactPath);
  }

  private handleAnnotationsReadAppearance(
    req: AnnotationsReadAppearanceWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const pageObjectNumber = session.resolvePageRef(req.page).pageObjectNumber;
    const drawing = new AnnotationFlattener(this.runtime, session).readAppearance(
      pageObjectNumber,
      req.ref,
      signal,
    );
    return wirePack(
      { tag: 'annotations.readAppearance', bytes: drawing.bytes, size: drawing.size },
      [drawing.bytes],
    );
  }

  private handleAnnotationsMove(
    req: AnnotationsMoveWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const pageObjectNumber = session.resolvePageRef(req.page).pageObjectNumber;
    const mutator = new AnnotationMutator(this.runtime, session);
    const result = mutator.move(pageObjectNumber, req.refs, req.toIndex, signal);
    return this.finishMutation(session, { tag: 'annotations.move', result }, req.artifactPath);
  }

  private handlePagesList(
    req: PagesListWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const reader = new PagesReader(this.runtime, session);
    const snapshot = reader.read(signal);
    return wirePack({ tag: 'pages.list', snapshot });
  }

  private handlePagesMove(
    req: PagesMoveWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new PagesMutator(this.runtime, session);
    const result = mutator.move(req.pages, req.toIndex, signal);
    return this.finishMutation(session, { tag: 'pages.move', result }, req.artifactPath);
  }

  private handlePagesRotate(
    req: PagesRotateWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new PagesMutator(this.runtime, session);
    const result = mutator.rotate(req.pages, req.rotation, signal);
    return this.finishMutation(session, { tag: 'pages.rotate', result }, req.artifactPath);
  }

  private handlePagesDelete(
    req: PagesDeleteWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new PagesMutator(this.runtime, session);
    const result = mutator.delete(req.pages, signal);
    return this.finishMutation(session, { tag: 'pages.delete', result }, req.artifactPath);
  }

  private handlePagesSetName(
    req: PagesSetNameWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new PagesMutator(this.runtime, session);
    const result = mutator.setName(
      {
        name: req.name,
        page: req.page,
        ...(req.replace !== undefined ? { replace: req.replace } : {}),
      },
      signal,
    );
    return this.finishMutation(session, { tag: 'pages.setName', result }, req.artifactPath);
  }

  private handlePagesRemoveName(
    req: PagesRemoveNameWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new PagesMutator(this.runtime, session);
    const result = mutator.removeName({ name: req.name }, signal);
    return this.finishMutation(session, { tag: 'pages.removeName', result }, req.artifactPath);
  }

  private handlePagesFlatten(
    req: PagesFlattenWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const result = new PagesFlattener(this.runtime, session).flatten(req.pages, req.usage, signal);
    // A write always names its pages; applying nothing names none.
    const wrote = result.meta.affectedPages.length > 0;
    if (!wrote) return wirePack({ tag: 'pages.flatten', result, wrote });
    return this.finishMutation(session, { tag: 'pages.flatten', result, wrote }, req.artifactPath);
  }

  private handleRedactionApply(
    req: RedactionApplyWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const result = new RedactionApplier(this.runtime, session).apply(req.scope, signal);
    // A write always names its pages; applying nothing names none.
    const wrote = result.meta.affectedPages.length > 0;
    if (!wrote) return wirePack({ tag: 'redaction.apply', result, wrote });
    return this.finishMutation(
      session,
      { tag: 'redaction.apply', result, wrote },
      req.artifactPath,
    );
  }

  private handlePagesExtract(
    req: PagesExtractWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const extracted = new PagesExtractor(this.runtime, session).extract(req.pages, signal);
    // A read: no finishMutation, no layer artifact. Bytes transfer zero-copy.
    return wirePack({ tag: 'pages.extract', bytes: extracted.bytes, size: extracted.size }, [
      extracted.bytes,
    ]);
  }

  private handlePagesInsert(
    req: PagesInsertWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const inserter = new PagesInserter(this.runtime, session);
    const result = inserter.insert(req.bytes, req.toIndex, signal);
    return this.finishMutation(session, { tag: 'pages.insert', result }, req.artifactPath);
  }

  private handlePagesInsertBlank(
    req: PagesInsertBlankWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const inserter = new PagesInserter(this.runtime, session);
    const result = inserter.insertBlank(
      { size: req.size, count: req.count },
      req.toIndex,
      signal,
      req.objectNumbers,
    );
    return this.finishMutation(session, { tag: 'pages.insertBlank', result }, req.artifactPath);
  }

  private handleAttachmentsList(
    req: AttachmentsListWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const attachments = new AttachmentReader(this.runtime, session).list(signal);
    return wirePack({ tag: 'attachments.list', attachments });
  }

  private handleAttachmentsReadFile(
    req: AttachmentsReadFileWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const content = new AttachmentReader(this.runtime, session).readFile(
      req.ref,
      req.path,
      req.maxDecodedBytes,
      signal,
    );
    // A read: no finishMutation, no layer artifact. Buffer-mode bytes
    // transfer zero-copy; path mode carries metadata only.
    return wirePack(
      { tag: 'attachments.readFile', content },
      content.bytes !== undefined ? [content.bytes] : [],
    );
  }

  private handleAttachmentsCreate(
    req: AttachmentsCreateWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new AttachmentMutator(this.runtime, session);
    const result = mutator.create(req.file, req.resources, signal);
    return this.finishMutation(session, { tag: 'attachments.create', result }, req.artifactPath);
  }

  private handleAttachmentsDelete(
    req: AttachmentsDeleteWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new AttachmentMutator(this.runtime, session);
    const result = mutator.delete(req.ref, signal);
    return this.finishMutation(session, { tag: 'attachments.delete', result }, req.artifactPath);
  }

  private async handleAnnotationsReadFile(
    req: AnnotationsReadFileWorkerRequest,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>> {
    const session = this.requireSession(req);
    const content = await new AttachmentReader(this.runtime, session).readAnnotationFile(
      session.resolvePageRef(req.page).pageObjectNumber,
      req.ref,
      req.path,
      req.maxDecodedBytes,
      signal,
      this.slices,
    );
    return wirePack(
      { tag: 'annotations.readFile', content },
      content.bytes !== undefined ? [content.bytes] : [],
    );
  }

  private async handleMeasureViewports(
    req: MeasureViewportsWorkerRequest,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>> {
    const session = this.requireSession(req);
    const viewports = await new MeasureReader(this.runtime, session).viewports(
      session.resolvePageRef(req.page).pageObjectNumber,
      signal,
      this.slices,
    );
    return wirePack({ tag: 'measure.viewports', page: req.page, viewports });
  }
  private handleMeasureSetScale(
    req: MeasureSetScaleWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    new MeasureMutator(this.runtime, session).setScale(
      session.resolvePageRef(req.page).pageObjectNumber,
      req.measure,
      signal,
    );
    return this.finishMutation(
      session,
      {
        tag: 'measure.setScale',
        result: {
          page: req.page,
          meta: { affectedPages: [], cacheDelta: null },
        },
      },
      req.artifactPath,
    );
  }

  private handlePieceInfoRead(
    req: PieceInfoReadWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const accessor = new PieceInfoAccessor(
      this.runtime,
      session,
      req.page ? session.resolvePageRef(req.page).pageObjectNumber : undefined,
    );
    const snapshot = accessor.read(req.application, signal);
    return wirePack({ tag: 'pieceInfo.read', snapshot });
  }

  private handlePieceInfoUpdate(
    req: PieceInfoUpdateWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const accessor = new PieceInfoAccessor(
      this.runtime,
      session,
      req.page ? session.resolvePageRef(req.page).pageObjectNumber : undefined,
    );
    accessor.update(req.application, req.patch, signal);
    const result = {
      pieceInfo: accessor.read(req.application, signal),
      meta: { affectedPages: [], cacheDelta: null },
    };
    // A mutation: layer sessions persist the artifact like every other write.
    return this.finishMutation(session, { tag: 'pieceInfo.update', result }, req.artifactPath);
  }

  private handlePieceInfoApplications(
    req: PieceInfoApplicationsWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const accessor = new PieceInfoAccessor(
      this.runtime,
      session,
      req.page ? session.resolvePageRef(req.page).pageObjectNumber : undefined,
    );
    const applications = accessor.applications(signal);
    return wirePack({ tag: 'pieceInfo.applications', applications });
  }

  private handlePieceInfoDelete(
    req: PieceInfoDeleteWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const accessor = new PieceInfoAccessor(
      this.runtime,
      session,
      req.page ? session.resolvePageRef(req.page).pageObjectNumber : undefined,
    );
    accessor.delete(req.application, signal);
    const result = { meta: { affectedPages: [], cacheDelta: null } };
    return this.finishMutation(session, { tag: 'pieceInfo.delete', result }, req.artifactPath);
  }

  private async handlePagesText(
    req: PagesTextWorkerRequest,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>> {
    const session = this.requireSession(req);
    const reader = new PageTextReader(this.runtime, session);
    const pageObjectNumber = session.resolvePageRef(req.page).pageObjectNumber;
    const snapshot = await reader.read(pageObjectNumber, signal, this.slices);
    return wirePack({ tag: 'pages.text', snapshot });
  }

  private async handlePagesGeometry(
    req: PagesGeometryWorkerRequest,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>> {
    const session = this.requireSession(req);
    const reader = new PageGeometryReader(this.runtime, session);
    const pageObjectNumber = session.resolvePageRef(req.page).pageObjectNumber;
    const snapshot = await reader.read(pageObjectNumber, signal, this.slices);
    return wirePack({ tag: 'pages.geometry', page: req.page, snapshot });
  }

  private async handleSearchQuery(
    req: SearchQueryWorkerRequest,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>> {
    const session = this.requireSession(req);
    const reader = new SearchReader(this.runtime, session);
    const slice = await reader.query(req.request, signal, this.slices);
    return wirePack({ tag: 'search.query', slice });
  }

  private async handlePagesRender(
    req: PagesRenderWorkerRequest<PdfCoordinates>,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>> {
    const session = this.requireSession(req);
    const reader = new PageRenderReader(this.runtime, session);
    const { raster, area } = await reader.render(
      session.resolvePageRef(req.page).pageObjectNumber,
      req.options ?? {},
      signal,
      this.slices,
    );
    return wirePack({ tag: 'pages.render', page: req.page, area, raster }, [raster.data]);
  }

  /**
   * The work of a job that pauses between slices, or null for one that runs in
   * one go: renders, and the reads that load a page (its text, geometry,
   * annotation appearances, measurement viewports, an annotation's file) or
   * many (a search). Writes never pause: a read must never see half of one.
   */
  private slicedWork(msg: FileSpaceJob): SlicedWork | null {
    switch (msg.kind) {
      case 'pages.render':
        return { pdfium: (signal) => this.handlePagesRender(msg, signal) };
      case 'pages.renderEncoded':
        return {
          pdfium: (signal) => this.handlePagesRender({ ...msg, kind: 'pages.render' }, signal),
          encode: (rendered, signal) => this.encodeRendered(rendered, msg.encode, signal),
        };
      case 'document.renderPageFile':
        return { pdfium: (signal) => this.handleDocumentRenderPageFile(msg, signal) };
      case 'document.renderPageFileEncoded':
        return {
          pdfium: (signal) =>
            this.handleDocumentRenderPageFile({ ...msg, kind: 'document.renderPageFile' }, signal),
          encode: (rendered, signal) => this.encodeRendered(rendered, msg.encode, signal),
        };
      case 'annotations.renderAppearances':
        return { pdfium: (signal) => this.handleAnnotationsRenderAppearances(msg, signal) };
      case 'annotations.renderAppearancesEncoded':
        return {
          pdfium: (signal) =>
            this.handleAnnotationsRenderAppearances(
              { ...msg, kind: 'annotations.renderAppearances' },
              signal,
            ),
          encode: (rendered, signal) =>
            this.encodeAppearances(rendered, msg.page, msg.encode, signal),
        };
      case 'pages.text':
        return { pdfium: (signal) => this.handlePagesText(msg, signal) };
      case 'pages.geometry':
        return { pdfium: (signal) => this.handlePagesGeometry(msg, signal) };
      case 'measure.viewports':
        return { pdfium: (signal) => this.handleMeasureViewports(msg, signal) };
      case 'annotations.readFile':
        return { pdfium: (signal) => this.handleAnnotationsReadFile(msg, signal) };
      case 'search.query':
        return { pdfium: (signal) => this.handleSearchQuery(msg, signal) };
      default:
        return null;
    }
  }

  /**
   * A job that pauses between slices of its PDFium work, so this thread can
   * receive an abort meanwhile. Until that work ends (`busy`), requests are
   * held. An encoded kind then encodes while other requests run.
   */
  private async runSliced(
    job: PageSpaceJob,
    msg: FileSpaceJob,
    effect: PageEffect,
    work: SlicedWork,
  ): Promise<void> {
    // Fail-fast before any native work: a host without an injected encoder
    // (browser/local workers) rejects the job without paying for a raster it
    // could never encode.
    if (work.encode && !this.options.imageEncoder) {
      this.post(
        wirePack({ kind: 'reject', jobId: msg.jobId, error: noEncoderError() }, EMPTY_TRANSFER),
      );
      return;
    }
    const ctrl = new AbortController();
    this.aborts.set(msg.jobId, ctrl);
    // Set before the work's first await, so a request that arrives while it
    // pauses is held.
    this.busy = true;
    try {
      let pdfium: WirePack<WorkerResultPayload<PdfCoordinates>>;
      try {
        pdfium = await work.pdfium(ctrl.signal);
      } finally {
        this.busy = false;
        // After this job's own reply below, which follows synchronously.
        queueMicrotask(() => this.drain());
      }
      this.resolve(msg, work.encode ? await work.encode(pdfium, ctrl.signal) : pdfium);
    } catch (err) {
      this.post(
        wirePack({ kind: 'reject', jobId: msg.jobId, error: serializeError(err) }, EMPTY_TRANSFER),
      );
    } finally {
      this.aborts.delete(msg.jobId);
      this.closePagesChangedBy(job, effect);
    }
  }

  private async encodeRaster(
    raster: PageRaster,
    encode: RenderEncode,
    signal: AbortSignal,
  ): Promise<EncodedImageWire> {
    const encoder = this.options.imageEncoder;
    if (!encoder) {
      throw new EngineError(EngineErrorCode.NotImplemented, NO_ENCODER_MESSAGE);
    }
    const { bytes, contentType } = await encoder.encode(raster, encode);
    // The encoder is not abortable; honor a cancellation that arrived
    // while it ran by rejecting instead of resolving a dead job.
    if (signal.aborted) {
      throw new EngineError(EngineErrorCode.Aborted, 'aborted during image encode');
    }
    return { contentType, width: raster.width, height: raster.height, bytes };
  }

  /** The encoded reply of a page render's raw one. */
  private async encodeRendered(
    rendered: WirePack<WorkerResultPayload<PdfCoordinates>>,
    encode: RenderEncode,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>> {
    const { payload } = rendered;
    if (payload.tag === 'pages.render') {
      const image = await this.encodeRaster(payload.raster, encode, signal);
      return wirePack({ tag: 'pages.renderEncoded', image }, [image.bytes.buffer]);
    }
    if (payload.tag === 'document.renderPageFile') {
      // The transient session closed when the render ended; the raster owns
      // its pixels, so encoding after close is sound.
      const image = await this.encodeRaster(payload.raster, encode, signal);
      return wirePack(
        {
          tag: 'document.renderPageFileEncoded',
          page: payload.page,
          pageCount: payload.pageCount,
          image,
        },
        [image.bytes.buffer],
      );
    }
    throw new EngineError(EngineErrorCode.WireFormat, `unexpected ${payload.tag}`);
  }

  /** The encoded reply of an appearance render's raw one, its rasters encoded one by one. */
  private async encodeAppearances(
    rendered: WirePack<WorkerResultPayload<PdfCoordinates>>,
    page: PageRef,
    encode: RenderEncode,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>> {
    if (rendered.payload.tag !== 'annotations.renderAppearances') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected ${rendered.payload.tag}`);
    }
    const { appearances } = rendered.payload.result;
    // Sequential encode, deliberately: the whole raster batch already
    // exists in `rendered` (peak memory is set by the render, not by encode
    // order), so fanning every appearance into the process-wide encoder
    // pool at once would only let one big batch monopolize it and starve
    // the encodes of interleaved jobs. One at a time matches the
    // previous API-side encoding loop exactly and keeps the pool fair.
    const encoded: EncodedAppearanceWire<PdfCoordinates>[] = [];
    for (const a of appearances) {
      encoded.push({
        ref: a.ref,
        mode: a.mode,
        rect: a.rect,
        image: await this.encodeRaster(a.raster, encode, signal),
      });
    }
    return wirePack(
      {
        tag: 'annotations.renderAppearancesEncoded',
        page,
        result: { page: rendered.payload.result.page, appearances: encoded },
      },
      encoded.map((e) => e.image.bytes.buffer),
    );
  }

  /**
   * A rewrite drops every revision, and with them every signature: a signed
   * document refuses it unless the session permits breaking signatures
   * (`signedDocumentPolicy: 'permit'`). One rule for both engines.
   */
  private assertRewriteKeepsSignatures(session: DocumentSession, mode: PdfSaveMode): void {
    if (mode !== 'rewrite' || session.signedDocumentPolicy !== 'protect') return;
    const protection = this.probeProtection(session);
    if (protection && protection.judged !== null) {
      throw new EngineError(
        EngineErrorCode.ProtectedDocument,
        'the document is signed: a rewrite save would void every signature (use an incremental save)',
      );
    }
  }

  private handleDocumentSaveBuffer(
    req: DocumentSaveBufferWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    this.assertRewriteKeepsSignatures(session, req.mode);
    // A save that changes nothing returns the loaded bytes verbatim: a
    // signed file must come back exactly as it was sealed. Whether anything
    // changed is the saver's answer (`snapshot`): the session's counter when
    // nothing was mutated, the fork's save pass otherwise — an annotation
    // added and removed again leaves the document as loaded.
    if (req.mode === 'incremental') {
      const snap = new DocumentSaver(this.runtime, session).snapshot();
      return wirePack(
        { tag: 'document.saveBuffer', bytes: snap.bytes, size: snap.bytes.byteLength },
        [snap.bytes],
      );
    }
    const saved = new DocumentSaver(this.runtime, session).saveStandaloneToBuffer(req.mode);
    return wirePack({ tag: 'document.saveBuffer', bytes: saved.bytes, size: saved.size }, [
      saved.bytes,
    ]);
  }

  private handleDocumentSaveFile(
    req: DocumentSaveFileWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    this.assertRewriteKeepsSignatures(session, req.mode);
    // The no-op save law for files: a session whose document is still the
    // one it was opened with streams its loaded bytes — for a layer, the
    // base plus the loaded delta, never the base file alone — verbatim. The
    // decision is the saver's (see handleDocumentSaveBuffer); when its pass
    // wrote nothing, nothing reached the file yet.
    const unchanged =
      req.mode === 'incremental' &&
      (!session.hasUnsavedEdits() ||
        new DocumentSaver(this.runtime, session).saveStandaloneToFileEx(req.path, req.mode)
          .unchangedSinceLoad);
    if (unchanged) {
      new DocumentSaver(this.runtime, session).copyLoadedBytesToFile(req.path);
      return wirePack({ tag: 'document.saveFile', path: req.path });
    }
    if (req.mode === 'incremental') {
      return wirePack({ tag: 'document.saveFile', path: req.path });
    }
    const saved = new DocumentSaver(this.runtime, session).saveStandaloneToFile(req.path, req.mode);
    return wirePack({ tag: 'document.saveFile', path: saved.path });
  }

  private handleDocumentSaveLayerBuffer(
    req: DocumentSaveLayerBufferWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    if (session.kind !== 'layer') {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'document has no layer to export (opened without a layer)',
      );
    }
    const artifact = new DocumentSaver(this.runtime, session).saveLayerArtifact();
    return wirePack(
      { tag: 'document.saveLayerBuffer', bytes: artifact.bytes, size: artifact.size },
      [artifact.bytes],
    );
  }

  private handleDocumentProbeSecurityFile(
    req: DocumentProbeSecurityFileWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const reader = new SecurityReader(this.runtime);
    const security = reader.probeFile(req.path, req.password);
    return wirePack({ tag: 'document.probeSecurityFile', security });
  }

  /**
   * One-shot file render (the derived-artifact warmer's producer): open the
   * base from a file path into a transient session — never stored in
   * `this.sessions`, so it can't collide with (or leak into) live document
   * sessions — resolve the display index to its durable page object number,
   * render, close. Shares the base parse with concurrent ad-hoc opens of
   * the same file via the registry refcount.
   */
  private async handleDocumentRenderPageFile(
    req: DocumentRenderPageFileWorkerRequest,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload<PdfCoordinates>>> {
    const session = new DocumentSession(this.runtime);
    const base = this.baseDocuments.acquireFileBase({
      key: `adhoc-file:${req.path}`,
      path: req.path,
      password: req.password,
    });
    try {
      session.openFromHandle(
        openLayerDocument(this.runtime, base, { kind: 'fresh' }, req.password),
      );
      const layout = new PagesReader(this.runtime, session).read(signal);
      const page = layout.pages[req.pageIndex];
      if (!page) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `renderPageFile: no page at index ${req.pageIndex} (pageCount=${layout.pageCount})`,
        );
      }
      // No session carried this document to the boundary, so the target
      // converts here, on the page it opened.
      const { raster } = await new PageRenderReader(this.runtime, session).render(
        page.ref.objectNumber,
        renderOptionsInFileSpace(req.options ?? {}, () => page.pdfCropBox),
        signal,
        this.slices,
      );
      return wirePack(
        {
          tag: 'document.renderPageFile',
          page: page.ref,
          pageCount: layout.pageCount,
          raster,
        },
        [raster.data],
      );
    } finally {
      // Closing the session releases the base acquisition through the
      // open handle's close stack (same lifecycle as live sessions).
      session.close();
    }
  }

  private handleDocumentCheckPasswordPermissions(
    req: DocumentCheckPasswordPermissionsWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    // The one handler that accepts a locked session: on a locked session,
    // "check this password" means "load the parked document with it". A
    // wrong password throws DocPasswordIncorrect and the session stays
    // parked for the next attempt.
    const parked = this.sessions.get(sessionKey(req.docId));
    let session: DocumentSession;
    if (parked?.isLocked()) {
      parked.unlockWith(req.password);
      parked.password = req.password;
      session = parked;
    } else {
      session = this.requireSession(req);
    }
    const security = new SecurityReader(this.runtime).checkPasswordPermissions(
      session,
      req.password,
      req.mode ?? 'any',
    );
    return wirePack({
      tag: 'document.checkPasswordPermissions',
      security,
      protection: this.probeProtection(session),
    });
  }

  private handleFontsRegister(
    req: FontsRegisterWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    this.fonts.register(
      req.fontKey,
      req.familyName,
      req.weight,
      req.italic,
      new Uint8Array(req.data),
    );
    return wirePack({
      tag: 'fonts.register',
      fontKey: req.fontKey,
      identity: this.fonts.describe(req.fontKey),
    });
  }

  private handleFontsAuthorizeEditing(
    req: FontsAuthorizeEditingWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    return wirePack({
      tag: 'fonts.authorizeEditing',
      identity: this.fonts.authorizeEditing(req.fontKey),
    });
  }

  /** Per-document font and text-layout settings (session state). */
  private handleDocumentSetFontSettings(
    req: DocumentSetFontSettingsWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const docPtr = session.requireDocPtr();
    const { fn } = this.runtime;
    if (req.embeddingPolicy !== undefined) {
      const code = { default: 0, subset: 1, full: 2 }[req.embeddingPolicy];
      if (!fn.EPDFDoc_SetFontEmbeddingPolicy(docPtr, code)) {
        throw new EngineError(EngineErrorCode.InvalidArg, 'EPDFDoc_SetFontEmbeddingPolicy failed');
      }
    }
    if (req.typographicFeatures !== undefined) {
      if (!fn.EPDFDoc_SetTypographicFeatures(docPtr, req.typographicFeatures)) {
        throw new EngineError(EngineErrorCode.InvalidArg, 'EPDFDoc_SetTypographicFeatures failed');
      }
    }
    return wirePack({ tag: 'document.setFontSettings' });
  }

  private handleFontsAddFallback(
    req: FontsAddFallbackWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    this.fonts.addFallback(req.fontKey);
    return wirePack({ tag: 'fonts.addFallback' });
  }

  private handleFontsClearFallbacks(
    _req: FontsClearFallbacksWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    this.fonts.clearFallbacks();
    return wirePack({ tag: 'fonts.clearFallbacks' });
  }

  private handleFontsClear(
    _req: FontsClearWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    this.fonts.clear();
    return wirePack({ tag: 'fonts.clear' });
  }

  /**
   * Close exactly one layer session — the reload seam for layer-session
   * freshness. The base document's refcount releases through the session's
   * close stack, so sibling layer sessions (and the base session) are
   * untouched. Idempotent: closing an absent session is a no-op ack,
   * because the caller may be reloading a layer this worker never held
   * (e.g. after a pool eviction).
   */
  private handleLayerClose(
    req: LayerCloseWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const key = sessionKey(req.docId, req.layerName);
    const session = this.sessions.get(key);
    if (session) {
      disposeFormModel(this.runtime, session);
      disposeSignatureModel(this.runtime, session);
      session.close();
      this.sessions.delete(key);
    }
    return wirePack({ tag: 'close' });
  }

  private handleClose(req: CloseWorkerRequest): WirePack<WorkerResultPayload<PdfCoordinates>> {
    for (const [key, session] of Array.from(this.sessions.entries())) {
      if (!sessionKeyBelongsToDoc(key, req.docId)) continue;
      disposeFormModel(this.runtime, session);
      disposeSignatureModel(this.runtime, session);
      session.close();
      this.sessions.delete(key);
    }
    return wirePack({ tag: 'close' });
  }

  private handleShutdown(
    _req: ShutdownWorkerRequest,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    if (!this.destroyed) {
      this.destroyed = true;
      for (const session of this.sessions.values()) {
        disposeFormModel(this.runtime, session);
        disposeSignatureModel(this.runtime, session);
        session.close();
      }
      this.sessions.clear();
      this.residency.closeIdle();
      this.baseDocuments.releaseAll();
      destroyLibrary(this.runtime);
    }
    return wirePack({ tag: 'shutdown' });
  }

  private requireSession(req: { docId: string; layerName?: string }): DocumentSession {
    const key = sessionKey(req.docId, req.layerName);
    const session = this.sessions.get(key);
    if (session?.isLocked()) {
      // Truthful error for any operation reaching a parked session: the
      // document exists but needs `security.unlock()` first.
      throw new EngineError(
        EngineErrorCode.DocPasswordRequired,
        `document session is password-locked: ${key}`,
      );
    }
    if (!session || !session.isOpen()) {
      throw new EngineError(EngineErrorCode.DocNotOpen, `document session not open: ${key}`);
    }
    session.assertUsable();
    return session;
  }

  /**
   * Finalize a mutation response. For a standalone session the mutation
   * result is returned as-is. For a layer session we additionally persist
   * the layer artifact (to file when `artifactPath` is given, otherwise to
   * a transferable buffer) and merge it onto the response envelope. This
   * is the one place the layer-vs-standalone branch lives, shared by every
   * annotation and page mutation handler.
   */
  private handleFormsList(
    req: FormsListWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const reader = new FormReader(this.runtime, session);
    return wirePack({ tag: 'forms.list', snapshot: reader.snapshot(signal) });
  }

  private handleFormsSetValue(
    req: FormsSetValueWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const result = mutator.setValue(req.ref, req.value, signal);
    return this.finishMutation(session, { tag: 'forms.setValue', result }, req.artifactPath);
  }

  private handleFormsReset(
    req: FormsResetWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const result = mutator.reset(req.refs, signal);
    return this.finishMutation(session, { tag: 'forms.reset', result }, req.artifactPath);
  }

  private handleFormsApplyEffects(
    req: FormsApplyEffectsWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const { result, wrote } = new FormsEffectsApplier(this.runtime, session).apply(
      req.effects,
      signal,
    );
    if (!wrote) return wirePack({ tag: 'forms.applyEffects', result, wrote });
    return this.finishMutation(
      session,
      { tag: 'forms.applyEffects', result, wrote },
      req.artifactPath,
    );
  }

  private handleFormsExport(
    req: FormsExportWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const reader = new FormReader(this.runtime, session);
    const exported = reader.exportData(req.format, signal);
    return wirePack({ tag: 'forms.export', format: exported.format, bytes: exported.bytes }, [
      exported.bytes,
    ]);
  }

  private handleFormsImport(
    req: FormsImportWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const result = mutator.importData(req.data, req.format, signal);
    return this.finishMutation(session, { tag: 'forms.import', result }, req.artifactPath);
  }

  private handleFormsRepair(
    req: FormsRepairWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const result = mutator.repair(req.bakeAppearances ?? false, signal);
    return this.finishMutation(session, { tag: 'forms.repair', result }, req.artifactPath);
  }

  private handleFormsCreateField(
    req: FormsCreateFieldWorkerRequest<PdfCoordinates>,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const { field } = mutator.createField(req.draft, signal, {
      ...(req.objectNumber !== undefined ? { objectNumber: req.objectNumber } : {}),
      ...(req.widgetObjectNumbers ? { widgetObjectNumbers: req.widgetObjectNumbers } : {}),
    });
    const meta = formMutationMeta([field.ref], field.widgets);
    return this.finishMutation(
      session,
      { tag: 'forms.createField', result: { field, meta } },
      req.artifactPath,
    );
  }

  private handleFormsUpdateField(
    req: FormsUpdateFieldWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const { field } = mutator.updateField(req.ref, req.patch, signal);
    const meta = formMutationMeta([field.ref], field.widgets);
    return this.finishMutation(
      session,
      { tag: 'forms.updateField', result: { field, meta } },
      req.artifactPath,
    );
  }

  private handleFormsSetSignatureAppearance(
    req: FormsSetSignatureAppearanceWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const { field } = new FormMutator(this.runtime, session).setSignatureAppearance(
      req.ref,
      new Uint8Array(req.pdf),
      signal,
    );
    const meta = formMutationMeta([field.ref], field.widgets);
    return this.finishMutation(
      session,
      { tag: 'forms.setSignatureAppearance', result: { field, meta } },
      req.artifactPath,
    );
  }

  private handleFormsDeleteField(
    req: FormsDeleteFieldWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const { deleted, removedWidgets } = mutator.deleteField(req.ref, signal);
    const meta = formMutationMeta([deleted], removedWidgets);
    return this.finishMutation(
      session,
      { tag: 'forms.deleteField', result: { meta } },
      req.artifactPath,
    );
  }

  private handleFormsAddWidget(
    req: FormsAddWidgetWorkerRequest<PdfCoordinates>,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const { field, widget } = mutator.addWidget(req.ref, req.placement, signal, {
      ...(req.objectNumber !== undefined ? { objectNumber: req.objectNumber } : {}),
      ...(req.splitObjectNumber !== undefined ? { splitObjectNumber: req.splitObjectNumber } : {}),
    });
    const meta = formMutationMeta([field.ref], [widget]);
    return this.finishMutation(
      session,
      { tag: 'forms.addWidget', result: { field, meta } },
      req.artifactPath,
    );
  }

  private handleFormsDetachWidget(
    req: FormsDetachWidgetWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const { field, widget } = mutator.detachWidget(req.ref, req.widget, signal);
    const meta = formMutationMeta([field.ref], [widget]);
    return this.finishMutation(
      session,
      { tag: 'forms.detachWidget', result: { field, meta } },
      req.artifactPath,
    );
  }

  private finishMutation<P extends WorkerResultPayload<PdfCoordinates>>(
    session: DocumentSession,
    payload: P,
    artifactPath?: string,
  ): WirePack<WorkerResultPayload<PdfCoordinates>> {
    // The write is done and read back: keep it. Nothing after this point
    // can abort it; a failure from here on (the layer save) leaves a
    // committed write that the caller must not mistake for a refused one.
    if (session.inTransaction()) session.commitTransaction();
    // Every successful write funnels through here. Forms mutators
    // invalidate the derived caches themselves before reading back, so their
    // tags are skipped to avoid rebuilding the model cache twice per write,
    // as do the flattener and redaction applier, which invalidate before
    // their post-apply annotation re-read. A completed signing installed new
    // bytes, which already counted.
    if (
      !payload.tag.startsWith('forms.') &&
      payload.tag !== 'pages.flatten' &&
      payload.tag !== 'redaction.apply' &&
      payload.tag !== 'signatures.complete'
    ) {
      session.invalidateDerived();
    }
    if (payload.tag !== 'signatures.complete') session.noteEdit();
    if (session.kind !== 'layer' || !session.persistLayerArtifact) {
      return wirePack(payload);
    }
    const saved = this.saveLayerArtifact(session, artifactPath);
    return wirePack({ ...payload, ...saved.payload }, saved.transfer);
  }

  private saveLayerArtifact(session: DocumentSession, artifactPath?: string): LayerArtifactSave {
    const saver = new DocumentSaver(this.runtime, session);
    const lastObjectNumber = session.lastObjectNumber();
    if (artifactPath) {
      const artifactFile = { ...saver.saveLayerArtifactToFile(artifactPath), lastObjectNumber };
      return { payload: { artifactFile }, transfer: [] };
    }
    const artifact = { ...saver.saveLayerArtifact(), lastObjectNumber };
    return { payload: { artifact }, transfer: [artifact.bytes] };
  }
}

interface LayerArtifactSave {
  payload:
    | { artifact: LayerArtifactWorkerPayload }
    | { artifactFile: LayerArtifactFileWorkerPayload };
  transfer: ArrayBuffer[];
}

/**
 * What a job does to the parsed pages the runtime keeps ({@link PageResidency})
 * and to the image decodes kept between jobs, from its effect (see
 * `RequestEffect`, stated on each request's definition):
 * - `none`: it writes nothing, so both stay.
 * - `keepsPages`: a `write` changes annotations, form fields, metadata,
 *   attachments or names - what a page reads afresh at every render, never its
 *   parsed content - so pages stay.
 * - `document`: a `contentWrite` changes content or the page tree in place
 *   (redaction, flattening, page edits), so the document's pages close before
 *   and after it.
 * - `runtime`: a `runtimeWrite` changes the fonts text is set in, for every
 *   document on the runtime, so every page closes.
 * Every write drops the kept image decodes. A page also closes when it is next
 * taken after a write in a layer transaction changed it
 * (`EPDFPage_IsContentCurrent`).
 */
type PageEffect = 'none' | 'keepsPages' | 'document' | 'runtime';

const PAGE_EFFECT: Record<RequestEffect, PageEffect> = {
  read: 'none',
  snapshot: 'none',
  session: 'none',
  open: 'none',
  close: 'none',
  write: 'keepsPages',
  contentWrite: 'document',
  runtimeWrite: 'runtime',
};

function pageEffectOf(job: PageSpaceJob): PageEffect {
  return job.kind === 'shutdown' ? 'none' : PAGE_EFFECT[job.effect];
}

/**
 * Whether a job writes to an open document: a `write` or `contentWrite`,
 * except a signing's completion, which replaces the document's bytes instead.
 * Such a job runs as one layer transaction, and a parked signing refuses it.
 */
function writesDocument(msg: FileSpaceJob): msg is Extract<FileSpaceJob, { docId: string }> {
  if (msg.kind === 'shutdown' || msg.kind === 'signatures.complete') return false;
  if (msg.effect !== 'write' && msg.effect !== 'contentWrite') return false;
  return 'docId' in msg;
}

const BASE_SESSION_SUFFIX = '__base__';

function sessionKey(docId: string, layerName?: string): string {
  return `${docId}::${layerName ? `layer:${layerName}` : BASE_SESSION_SUFFIX}`;
}

const NO_ENCODER_MESSAGE =
  'this engine has no image encoder (the *.renderEncoded kinds are cloud-server surface)';

/** What an encoded kind answers on a host without an image encoder. */
function noEncoderError(): SerializedEngineError {
  return serializeError(new EngineError(EngineErrorCode.NotImplemented, NO_ENCODER_MESSAGE));
}

function sessionKeyBelongsToDoc(key: string, docId: string): boolean {
  return key === sessionKey(docId) || key.startsWith(`${docId}::layer:`);
}

function isPasswordOpenError(error: unknown): boolean {
  return (
    error instanceof EngineError &&
    (error.code === EngineErrorCode.DocPasswordRequired ||
      error.code === EngineErrorCode.DocPasswordIncorrect)
  );
}

/**
 * The security probe a locked open answers with — identical to what
 * `SecurityReader.probeFile` reports for a password-protected file it
 * couldn't read: encrypted, password required, permissions unknown.
 * `securityStateFromProbe` + `passwordPromptFromState` on the client
 * turn this into `passwordPrompt: { state: 'required' }`.
 */
function passwordRequiredProbe() {
  return {
    encryptionState: 'encrypted' as const,
    encryptionRequiresPassword: true,
    securityHandlerRevision: null,
    pdfPermissionsBits: null,
    pdfPermissionsAllAllowed: null,
    pdfOpenedAs: null,
    securityProbedAt: Date.now(),
  };
}
