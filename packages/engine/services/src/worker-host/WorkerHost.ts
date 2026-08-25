import {
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
  type FormsAttachWidgetWorkerRequest,
  type FormsCreateFieldWorkerRequest,
  type FormsDeleteFieldWorkerRequest,
  type FormsDetachWidgetWorkerRequest,
  type FormsExportWorkerRequest,
  type FormsImportWorkerRequest,
  type FormsListWorkerRequest,
  type FormsRepairWorkerRequest,
  type FormsUpdateFieldWorkerRequest,
  type FormsResetWorkerRequest,
  type FormsSetValueWorkerRequest,
  type FontsRegisterWorkerRequest,
  type FontsAddFallbackWorkerRequest,
  type FontsClearFallbacksWorkerRequest,
  type FontsClearWorkerRequest,
  type AnnotationsListFullPageWorkerRequest,
  type AnnotationsListRawAllWorkerRequest,
  type AnnotationsListRawPageWorkerRequest,
  type AnnotationsRenderAppearancesWorkerRequest,
  type AnnotationsMoveWorkerRequest,
  type AnnotationsUpdateWorkerRequest,
  type CloseWorkerRequest,
  type LayerCloseWorkerRequest,
  type MetadataReadWorkerRequest,
  type MetadataUpdateWorkerRequest,
  type ActionsReadWorkerRequest,
  type OpenWorkerRequest,
  type PagesListWorkerRequest,
  type PagesGeometryWorkerRequest,
  type PagesMoveWorkerRequest,
  type PagesRotateWorkerRequest,
  type PagesDeleteWorkerRequest,
  type PagesExtractWorkerRequest,
  type PagesInsertWorkerRequest,
  type AttachmentsListWorkerRequest,
  type AttachmentsReadFileWorkerRequest,
  type AttachmentsCreateWorkerRequest,
  type AttachmentsDeleteWorkerRequest,
  type AnnotationsReadFileWorkerRequest,
  type PagesFlattenWorkerRequest,
  type RedactionApplyWorkerRequest,
  type PieceInfoApplicationsWorkerRequest,
  type PieceInfoClearWorkerRequest,
  type PieceInfoReadWorkerRequest,
  type PieceInfoUpdateWorkerRequest,
  type PageNetworkRenderFormat,
  type PageRaster,
  type PagesRenderWorkerRequest,
  type PagesRenderEncodedWorkerRequest,
  type DocumentRenderPageFileEncodedWorkerRequest,
  type AnnotationsRenderAppearancesEncodedWorkerRequest,
  type EncodedAppearanceWire,
  type EncodedImageWire,
  type RenderEncode,
  type PagesTextWorkerRequest,
  type SearchQueryWorkerRequest,
  type FormsApplyEffectsWorkerRequest,
  type SerializedEngineError,
  type ShutdownWorkerRequest,
  type WirePack,
  type WorkerJobId,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';
import type { MutationMeta } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { DocumentSession } from '../document-session/DocumentSession';
import { BaseDocumentRegistry } from '../document-session/lifecycle/BaseDocumentRegistry';
import {
  openFatMemoryDocument,
  openLayerDocument,
} from '../document-session/lifecycle/PdfDocumentOpener';
import { DocumentActionsReader } from '../features/actions';
import {
  AnnotationReader,
  AnnotationAppearanceReader,
  AnnotationMutator,
  RawAnnotationReader,
} from '../features/annotations';
import { AttachmentMutator, AttachmentReader } from '../features/attachments';
import { FontRegistrar, type StartupFontSpec } from '../features/fonts';
import { FormMutator, FormReader, FormsEffectsApplier, disposeFormModel } from '../features/forms';
import { PageGeometryReader } from '../features/geometry';
import { MetadataMutator, MetadataReader } from '../features/metadata';
import {
  PagesExtractor,
  PagesFlattener,
  PagesInserter,
  PagesMutator,
  PagesReader,
} from '../features/pages';
import { PieceInfoAccessor } from '../features/pieceinfo';
import { RedactionApplier } from '../features/redaction';
import { PageRenderReader } from '../features/render';
import { DocumentSaver } from '../features/save';
import { SearchReader } from '../features/search';
import { SecurityReader } from '../features/security';
import { PageTextReader } from '../features/text';
import { ensureInitialized, destroyLibrary } from '../runtime/lifecycle/bootstrap';

/** The image a {@link WorkerImageEncoder} produced. `bytes` must OWN its
 *  buffer (a fresh allocation, not a pooled `Buffer` slab view) — it is
 *  placed on the transfer manifest and moved zero-copy. */
export interface WorkerEncodedImage {
  contentType: string;
  bytes: Uint8Array;
}

/**
 * Injected image-encode capability for the `*.renderEncoded` wire kinds.
 * Dependency inversion keeps the native encoder OUT of this shared
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
      this.aborts.get(msg.jobId)?.abort();
      return;
    }

    // The encoded render kinds are the protocol's ONLY async ops: their
    // raster comes from the SAME sync handlers as the raw kinds (all
    // session/registry use completes before the first await), and only
    // the injected image encode awaits. They run on a parallel async
    // path with identical resolve/reject/abort bookkeeping; everything
    // else stays on the synchronous switch below, unchanged.
    if (
      msg.kind === 'pages.renderEncoded' ||
      msg.kind === 'document.renderPageFileEncoded' ||
      msg.kind === 'annotations.renderAppearancesEncoded'
    ) {
      void this.receiveEncoded(msg);
      return;
    }

    const ctrl = new AbortController();
    this.aborts.set(msg.jobId, ctrl);

    // Abort policy: only handlers that loop over pages/annotations honor
    // `ctrl.signal` (the read/mutation paths below). One-shot native
    // operations — open, document save, security probe, close, shutdown —
    // are effectively atomic from our side and intentionally non-abortable,
    // so they do not receive the signal.
    let resultPack: WirePack<WorkerResultPayload>;
    try {
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
        case 'actions.read':
          resultPack = this.handleActionsRead(msg, ctrl.signal);
          break;
        case 'annotations.listRawAll':
          resultPack = this.handleAnnotationsListRawAll(msg, ctrl.signal);
          break;
        case 'annotations.listRawPage':
          resultPack = this.handleAnnotationsListRawPage(msg, ctrl.signal);
          break;
        case 'annotations.listFullPage':
          resultPack = this.handleAnnotationsListFullPage(msg, ctrl.signal);
          break;
        case 'annotations.renderAppearances':
          resultPack = this.handleAnnotationsRenderAppearances(msg, ctrl.signal);
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
        case 'forms.deleteField':
          resultPack = this.handleFormsDeleteField(msg, ctrl.signal);
          break;
        case 'forms.attachWidget':
          resultPack = this.handleFormsAttachWidget(msg, ctrl.signal);
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
        case 'annotations.readFile':
          resultPack = this.handleAnnotationsReadFile(msg, ctrl.signal);
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
        case 'pieceInfo.clear':
          resultPack = this.handlePieceInfoClear(msg, ctrl.signal);
          break;
        case 'pages.text':
          resultPack = this.handlePagesText(msg, ctrl.signal);
          break;
        case 'pages.geometry':
          resultPack = this.handlePagesGeometry(msg, ctrl.signal);
          break;
        case 'pages.render':
          resultPack = this.handlePagesRender(msg, ctrl.signal);
          break;
        case 'search.query':
          resultPack = this.handleSearchQuery(msg, ctrl.signal);
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
        case 'document.renderPageFile':
          resultPack = this.handleDocumentRenderPageFile(msg, ctrl.signal);
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
      // Lift the handler's transfer manifest onto the response envelope
      // unchanged. The handler decided which buffers to move; the host
      // just relays that decision through the `resolve` envelope.
      this.post(
        wirePack(
          { kind: 'resolve', jobId: msg.jobId, result: resultPack.payload },
          resultPack.transfer,
        ),
      );
    } catch (err) {
      const error: SerializedEngineError = serializeError(err);
      // Reject envelopes never carry binary; explicit EMPTY_TRANSFER
      // documents that intent.
      this.post(wirePack({ kind: 'reject', jobId: msg.jobId, error }, EMPTY_TRANSFER));
    } finally {
      this.aborts.delete(msg.jobId);
    }
  }

  private handleOpen(req: OpenWorkerRequest): WirePack<WorkerResultPayload> {
    const key = sessionKey(req.docId, req.kind === 'open.fatMem' ? undefined : req.layerName);
    if (this.sessions.has(key)) {
      throw new EngineError(EngineErrorCode.InvalidArg, `document session already open: ${key}`);
    }
    const session = new DocumentSession(this.runtime);
    if (req.kind === 'open.fatMem') {
      const bytes = new Uint8Array(req.bytes);
      try {
        session.openFromHandle(openFatMemoryDocument(this.runtime, bytes, req.password));
      } catch (error) {
        // Password failures are a STATE, not an error: park the session with
        // the already-transferred bytes and answer with a security probe that
        // says "password required". The client handle comes up locked
        // (`security.passwordPrompt === 'required'`); a later
        // `document.checkPasswordPermissions` performs the actual load.
        if (!isPasswordOpenError(error)) throw error;
        session.parkLocked(bytes);
        this.sessions.set(key, session);
        return wirePack({
          tag: 'open',
          docId: req.docId,
          security: passwordRequiredProbe(),
        });
      }
    } else if (req.kind === 'open.layerMemBase') {
      const base = this.baseDocuments.acquireMemoryBase({
        key: req.baseKey,
        bytes: new Uint8Array(req.baseBytes),
        password: req.password,
      });
      session.openFromHandle(openLayerDocument(this.runtime, base, req.layer, req.password));
    } else {
      const base = this.baseDocuments.acquireFileBase({
        key: req.baseKey,
        path: req.basePath,
        password: req.password,
      });
      session.openFromHandle(openLayerDocument(this.runtime, base, req.layer, req.password));
    }
    this.sessions.set(key, session);
    return wirePack({
      tag: 'open',
      docId: req.docId,
      security: new SecurityReader(this.runtime).checkPasswordPermissions(
        session,
        req.password ?? '',
      ),
    });
  }

  private handleMetadataRead(
    req: MetadataReadWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const metadata = new MetadataReader(this.runtime, session).read(signal);
    return wirePack({ tag: 'metadata.read', metadata });
  }

  private handleMetadataUpdate(
    req: MetadataUpdateWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new MetadataMutator(this.runtime, session);
    const result = mutator.update(req.patch, signal);
    return this.finishMutation(session, { tag: 'metadata.update', result }, req.artifactPath);
  }

  private handleActionsRead(
    req: ActionsReadWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const snapshot = new DocumentActionsReader(this.runtime, session).read(signal);
    return wirePack({ tag: 'actions.read', snapshot });
  }

  private handleAnnotationsListRawAll(
    req: AnnotationsListRawAllWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const reader = new RawAnnotationReader(this.runtime, session);
    const snapshot = reader.listAll(signal);
    return wirePack({ tag: 'annotations.listRawAll', snapshot });
  }

  private handleAnnotationsListRawPage(
    req: AnnotationsListRawPageWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const reader = new RawAnnotationReader(this.runtime, session);
    const snapshot = reader.listOne(req.pageObjectNumber, signal);
    return wirePack({ tag: 'annotations.listRawPage', snapshot });
  }

  private handleAnnotationsListFullPage(
    req: AnnotationsListFullPageWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const reader = new AnnotationReader(this.runtime, session);
    const snapshot = reader.list(req.pageObjectNumber, signal);
    return wirePack({ tag: 'annotations.listFullPage', snapshot });
  }

  private handleAnnotationsRenderAppearances(
    req: AnnotationsRenderAppearancesWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const reader = new AnnotationAppearanceReader(this.runtime, session);
    const result = reader.render(req.pageObjectNumber, req.options ?? {}, signal);
    // Transfer every appearance raster buffer back zero-copy, like pages.render.
    const transfer = result.appearances.map((a) => a.raster.data);
    return wirePack({ tag: 'annotations.renderAppearances', result }, transfer);
  }

  private handleAnnotationsCreate(
    req: AnnotationsCreateWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new AnnotationMutator(this.runtime, session, this.fonts);
    const result = mutator.create(
      req.pageObjectNumber,
      req.draft,
      signal,
      req.actor,
      req.resources,
    );
    return this.finishMutation(session, { tag: 'annotations.create', result }, req.artifactPath);
  }

  private handleAnnotationsUpdate(
    req: AnnotationsUpdateWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new AnnotationMutator(this.runtime, session, this.fonts);
    const result = mutator.update(req.ref, req.patch, signal, req.actor, req.resources);
    return this.finishMutation(session, { tag: 'annotations.update', result }, req.artifactPath);
  }

  private handleAnnotationsDelete(
    req: AnnotationsDeleteWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new AnnotationMutator(this.runtime, session);
    const result = mutator.delete(req.ref, signal);
    return this.finishMutation(session, { tag: 'annotations.delete', result }, req.artifactPath);
  }

  private handleAnnotationsMove(
    req: AnnotationsMoveWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new AnnotationMutator(this.runtime, session);
    const result = mutator.move(req.pageObjectNumber, req.refs, req.toIndex, signal);
    return this.finishMutation(session, { tag: 'annotations.move', result }, req.artifactPath);
  }

  private handlePagesList(
    req: PagesListWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const reader = new PagesReader(this.runtime, session);
    const snapshot = reader.read(signal);
    return wirePack({ tag: 'pages.list', snapshot });
  }

  private handlePagesMove(
    req: PagesMoveWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new PagesMutator(this.runtime, session);
    const result = mutator.move(req.pageObjectNumbers, req.destIndex, signal);
    return this.finishMutation(session, { tag: 'pages.move', result }, req.artifactPath);
  }

  private handlePagesRotate(
    req: PagesRotateWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new PagesMutator(this.runtime, session);
    const result = mutator.rotate(req.pageObjectNumbers, req.rotation, signal);
    return this.finishMutation(session, { tag: 'pages.rotate', result }, req.artifactPath);
  }

  private handlePagesDelete(
    req: PagesDeleteWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new PagesMutator(this.runtime, session);
    const result = mutator.delete(req.pageObjectNumbers, signal);
    return this.finishMutation(session, { tag: 'pages.delete', result }, req.artifactPath);
  }

  private handlePagesFlatten(
    req: PagesFlattenWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const result = new PagesFlattener(this.runtime, session).flatten(
      req.pageObjectNumbers,
      req.usage,
      signal,
    );
    if (result.meta === null) return wirePack({ tag: 'pages.flatten', result });
    return this.finishMutation(session, { tag: 'pages.flatten', result }, req.artifactPath);
  }

  private handleRedactionApply(
    req: RedactionApplyWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const result = new RedactionApplier(this.runtime, session).apply(req.scope, signal);
    if (result.meta === null) return wirePack({ tag: 'redaction.apply', result });
    return this.finishMutation(session, { tag: 'redaction.apply', result }, req.artifactPath);
  }

  private handlePagesExtract(
    req: PagesExtractWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const extracted = new PagesExtractor(this.runtime, session).extract(
      req.pageObjectNumbers,
      signal,
    );
    // A read: no finishMutation, no layer artifact. Bytes transfer zero-copy.
    return wirePack({ tag: 'pages.extract', bytes: extracted.bytes, size: extracted.size }, [
      extracted.bytes,
    ]);
  }

  private handlePagesInsert(
    req: PagesInsertWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const inserter = new PagesInserter(this.runtime, session);
    const result = inserter.insert(req.bytes, req.destIndex, signal);
    return this.finishMutation(session, { tag: 'pages.insert', result }, req.artifactPath);
  }

  private handleAttachmentsList(
    req: AttachmentsListWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const items = new AttachmentReader(this.runtime, session).list(signal);
    return wirePack({ tag: 'attachments.list', items });
  }

  private handleAttachmentsReadFile(
    req: AttachmentsReadFileWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
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
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new AttachmentMutator(this.runtime, session);
    const result = mutator.create(req.file, req.resources, signal);
    return this.finishMutation(session, { tag: 'attachments.create', result }, req.artifactPath);
  }

  private handleAttachmentsDelete(
    req: AttachmentsDeleteWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new AttachmentMutator(this.runtime, session);
    const result = mutator.delete(req.ref, signal);
    return this.finishMutation(session, { tag: 'attachments.delete', result }, req.artifactPath);
  }

  private handleAnnotationsReadFile(
    req: AnnotationsReadFileWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const content = new AttachmentReader(this.runtime, session).readAnnotationFile(
      req.pageObjectNumber,
      req.ref,
      req.path,
      req.maxDecodedBytes,
      signal,
    );
    return wirePack(
      { tag: 'annotations.readFile', content },
      content.bytes !== undefined ? [content.bytes] : [],
    );
  }

  private handlePieceInfoRead(
    req: PieceInfoReadWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const accessor = new PieceInfoAccessor(this.runtime, session, req.pageObjectNumber);
    const snapshot = accessor.read(req.application, signal);
    return wirePack({ tag: 'pieceInfo.read', snapshot });
  }

  private handlePieceInfoUpdate(
    req: PieceInfoUpdateWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const accessor = new PieceInfoAccessor(this.runtime, session, req.pageObjectNumber);
    accessor.update(req.application, req.patch, signal);
    // A mutation: layer sessions persist the artifact like every other write.
    return this.finishMutation(session, { tag: 'pieceInfo.update' }, req.artifactPath);
  }

  private handlePieceInfoApplications(
    req: PieceInfoApplicationsWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const accessor = new PieceInfoAccessor(this.runtime, session, req.pageObjectNumber);
    const applications = accessor.applications(signal);
    return wirePack({ tag: 'pieceInfo.applications', applications });
  }

  private handlePieceInfoClear(
    req: PieceInfoClearWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const accessor = new PieceInfoAccessor(this.runtime, session, req.pageObjectNumber);
    accessor.clear(req.application, signal);
    return this.finishMutation(session, { tag: 'pieceInfo.clear' }, req.artifactPath);
  }

  private handlePagesText(
    req: PagesTextWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const reader = new PageTextReader(this.runtime, session);
    const snapshot = reader.read(req.pageObjectNumber, signal);
    return wirePack({ tag: 'pages.text', snapshot });
  }

  private handlePagesGeometry(
    req: PagesGeometryWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const reader = new PageGeometryReader(this.runtime, session);
    const snapshot = reader.read(req.pageObjectNumber, signal);
    return wirePack({ tag: 'pages.geometry', snapshot });
  }

  private handleSearchQuery(
    req: SearchQueryWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const reader = new SearchReader(this.runtime, session);
    const slice = reader.query(req.request, signal);
    return wirePack({ tag: 'search.query', slice });
  }

  private handlePagesRender(
    req: PagesRenderWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const reader = new PageRenderReader(this.runtime, session);
    const raster = reader.render(req.pageObjectNumber, req.options ?? {}, signal);
    return wirePack({ tag: 'pages.render', raster }, [raster.data]);
  }

  private async receiveEncoded(
    msg:
      | PagesRenderEncodedWorkerRequest
      | DocumentRenderPageFileEncodedWorkerRequest
      | AnnotationsRenderAppearancesEncodedWorkerRequest,
  ): Promise<void> {
    // Fail-fast BEFORE any native work: a host without an injected
    // encoder (browser/local workers) rejects the job without paying for
    // a raster it could never encode.
    if (!this.options.imageEncoder) {
      this.post(
        wirePack(
          {
            kind: 'reject',
            jobId: msg.jobId,
            error: serializeError(
              new EngineError(
                EngineErrorCode.NotImplemented,
                'this engine has no image encoder (the *.renderEncoded kinds are cloud-server surface)',
              ),
            ),
          },
          EMPTY_TRANSFER,
        ),
      );
      return;
    }
    const ctrl = new AbortController();
    this.aborts.set(msg.jobId, ctrl);
    try {
      let resultPack: WirePack<WorkerResultPayload>;
      switch (msg.kind) {
        case 'pages.renderEncoded':
          resultPack = await this.handlePagesRenderEncoded(msg, ctrl.signal);
          break;
        case 'document.renderPageFileEncoded':
          resultPack = await this.handleDocumentRenderPageFileEncoded(msg, ctrl.signal);
          break;
        case 'annotations.renderAppearancesEncoded':
          resultPack = await this.handleAnnotationsRenderAppearancesEncoded(msg, ctrl.signal);
          break;
      }
      this.post(
        wirePack(
          { kind: 'resolve', jobId: msg.jobId, result: resultPack.payload },
          resultPack.transfer,
        ),
      );
    } catch (err) {
      this.post(
        wirePack({ kind: 'reject', jobId: msg.jobId, error: serializeError(err) }, EMPTY_TRANSFER),
      );
    } finally {
      this.aborts.delete(msg.jobId);
    }
  }

  private async encodeRaster(
    raster: PageRaster,
    encode: RenderEncode,
    signal: AbortSignal,
  ): Promise<EncodedImageWire> {
    const encoder = this.options.imageEncoder;
    if (!encoder) {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        'this engine has no image encoder (the *.renderEncoded kinds are cloud-server surface)',
      );
    }
    const { bytes, contentType } = await encoder.encode(raster, encode);
    // The encoder is not abortable; honor a cancellation that arrived
    // while it ran by rejecting instead of resolving a dead job.
    if (signal.aborted) {
      throw new EngineError(EngineErrorCode.Aborted, 'aborted during image encode');
    }
    return { contentType, width: raster.width, height: raster.height, bytes };
  }

  private async handlePagesRenderEncoded(
    req: PagesRenderEncodedWorkerRequest,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload>> {
    const inner = this.handlePagesRender({ ...req, kind: 'pages.render' }, signal);
    if (inner.payload.tag !== 'pages.render') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected ${inner.payload.tag}`);
    }
    const image = await this.encodeRaster(inner.payload.raster, req.encode, signal);
    return wirePack({ tag: 'pages.renderEncoded', image }, [image.bytes.buffer]);
  }

  private async handleDocumentRenderPageFileEncoded(
    req: DocumentRenderPageFileEncodedWorkerRequest,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload>> {
    // The transient session closes inside the sync handler's finally —
    // the raster owns its pixels, so encoding after close is sound.
    const inner = this.handleDocumentRenderPageFile(
      { ...req, kind: 'document.renderPageFile' },
      signal,
    );
    if (inner.payload.tag !== 'document.renderPageFile') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected ${inner.payload.tag}`);
    }
    const image = await this.encodeRaster(inner.payload.raster, req.encode, signal);
    return wirePack(
      {
        tag: 'document.renderPageFileEncoded',
        pageObjectNumber: inner.payload.pageObjectNumber,
        pageCount: inner.payload.pageCount,
        image,
      },
      [image.bytes.buffer],
    );
  }

  private async handleAnnotationsRenderAppearancesEncoded(
    req: AnnotationsRenderAppearancesEncodedWorkerRequest,
    signal: AbortSignal,
  ): Promise<WirePack<WorkerResultPayload>> {
    const inner = this.handleAnnotationsRenderAppearances(
      { ...req, kind: 'annotations.renderAppearances' },
      signal,
    );
    if (inner.payload.tag !== 'annotations.renderAppearances') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected ${inner.payload.tag}`);
    }
    const { pageState, appearances } = inner.payload.result;
    // SEQUENTIAL encode, deliberately: the whole raster batch already
    // exists in `inner` (peak memory is set by the render, not by encode
    // order), so fanning every appearance into the process-wide encoder
    // pool at once would only let one big batch monopolize it and starve
    // the encodes of interleaved jobs. One at a time matches the
    // previous API-side encoding loop exactly and keeps the pool fair.
    const encoded: EncodedAppearanceWire[] = [];
    for (const a of appearances) {
      encoded.push({
        ref: a.ref,
        mode: a.mode,
        rect: a.rect,
        image: await this.encodeRaster(a.raster, req.encode, signal),
      });
    }
    return wirePack(
      { tag: 'annotations.renderAppearancesEncoded', result: { pageState, appearances: encoded } },
      encoded.map((e) => e.image.bytes.buffer),
    );
  }

  private handleDocumentSaveBuffer(
    req: DocumentSaveBufferWorkerRequest,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const saved = new DocumentSaver(this.runtime, session).saveStandaloneToBuffer(req.mode);
    return wirePack({ tag: 'document.saveBuffer', bytes: saved.bytes, size: saved.size }, [
      saved.bytes,
    ]);
  }

  private handleDocumentSaveFile(
    req: DocumentSaveFileWorkerRequest,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const saved = new DocumentSaver(this.runtime, session).saveStandaloneToFile(req.path, req.mode);
    return wirePack({ tag: 'document.saveFile', path: saved.path });
  }

  private handleDocumentSaveLayerBuffer(
    req: DocumentSaveLayerBufferWorkerRequest,
  ): WirePack<WorkerResultPayload> {
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
  ): WirePack<WorkerResultPayload> {
    const reader = new SecurityReader(this.runtime);
    const security = reader.probeFile(req.path, req.password);
    return wirePack({ tag: 'document.probeSecurityFile', security });
  }

  /**
   * One-shot file render (the derived-artifact warmer's producer): open the
   * base from a file path into a TRANSIENT session — never stored in
   * `this.sessions`, so it can't collide with (or leak into) live document
   * sessions — resolve the display index to its durable page object number,
   * render, close. Shares the base parse with concurrent ad-hoc opens of
   * the same file via the registry refcount.
   */
  private handleDocumentRenderPageFile(
    req: DocumentRenderPageFileWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
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
      const raster = new PageRenderReader(this.runtime, session).render(
        page.pageObjectNumber,
        req.options ?? {},
        signal,
      );
      return wirePack(
        {
          tag: 'document.renderPageFile',
          pageObjectNumber: page.pageObjectNumber,
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
  ): WirePack<WorkerResultPayload> {
    // The one handler that accepts a LOCKED session: on a locked session,
    // "check this password" means "load the parked bytes with it". A wrong
    // password throws DocPasswordIncorrect and the session stays parked
    // (bytes retained) for the next attempt.
    const parked = this.sessions.get(sessionKey(req.docId));
    let session: DocumentSession;
    if (parked?.isLocked()) {
      parked.openFromHandle(
        openFatMemoryDocument(this.runtime, parked.lockedBytes(), req.password),
      );
      session = parked;
    } else {
      session = this.requireSession(req);
    }
    const security = new SecurityReader(this.runtime).checkPasswordPermissions(
      session,
      req.password,
      req.mode ?? 'any',
    );
    return wirePack({ tag: 'document.checkPasswordPermissions', security });
  }

  private handleFontsRegister(req: FontsRegisterWorkerRequest): WirePack<WorkerResultPayload> {
    this.fonts.register(
      req.fontKey,
      req.familyName,
      req.weight,
      req.italic,
      new Uint8Array(req.data),
    );
    return wirePack({ tag: 'fonts.register', fontKey: req.fontKey });
  }

  private handleFontsAddFallback(
    req: FontsAddFallbackWorkerRequest,
  ): WirePack<WorkerResultPayload> {
    this.fonts.addFallback(req.fontKey);
    return wirePack({ tag: 'fonts.addFallback' });
  }

  private handleFontsClearFallbacks(
    _req: FontsClearFallbacksWorkerRequest,
  ): WirePack<WorkerResultPayload> {
    this.fonts.clearFallbacks();
    return wirePack({ tag: 'fonts.clearFallbacks' });
  }

  private handleFontsClear(_req: FontsClearWorkerRequest): WirePack<WorkerResultPayload> {
    this.fonts.clear();
    return wirePack({ tag: 'fonts.clear' });
  }

  /**
   * Close exactly ONE layer session — the reload seam for layer-session
   * freshness. The base document's refcount releases through the session's
   * close stack, so sibling layer sessions (and the base session) are
   * untouched. Idempotent: closing an absent session is a no-op ack,
   * because the caller may be reloading a layer this worker never held
   * (e.g. after a pool eviction).
   */
  private handleLayerClose(req: LayerCloseWorkerRequest): WirePack<WorkerResultPayload> {
    const key = sessionKey(req.docId, req.layerName);
    const session = this.sessions.get(key);
    if (session) {
      disposeFormModel(this.runtime, session);
      session.close();
      this.sessions.delete(key);
    }
    return wirePack({ tag: 'close' });
  }

  private handleClose(req: CloseWorkerRequest): WirePack<WorkerResultPayload> {
    for (const [key, session] of Array.from(this.sessions.entries())) {
      if (!sessionKeyBelongsToDoc(key, req.docId)) continue;
      disposeFormModel(this.runtime, session);
      session.close();
      this.sessions.delete(key);
    }
    return wirePack({ tag: 'close' });
  }

  private handleShutdown(_req: ShutdownWorkerRequest): WirePack<WorkerResultPayload> {
    if (!this.destroyed) {
      this.destroyed = true;
      for (const session of this.sessions.values()) {
        disposeFormModel(this.runtime, session);
        session.close();
      }
      this.sessions.clear();
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
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const reader = new FormReader(this.runtime, session);
    return wirePack({ tag: 'forms.list', snapshot: reader.snapshot(signal) });
  }

  private handleFormsSetValue(
    req: FormsSetValueWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const result = mutator.setValue(req.ref, req.value, signal);
    return this.finishMutation(session, { tag: 'forms.setValue', result }, req.artifactPath);
  }

  private handleFormsReset(
    req: FormsResetWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const result = mutator.reset(req.ref, signal);
    return this.finishMutation(session, { tag: 'forms.reset', result }, req.artifactPath);
  }

  private handleFormsApplyEffects(
    req: FormsApplyEffectsWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const result = new FormsEffectsApplier(this.runtime, session).apply(req.effects, signal);
    if (result.meta === null) return wirePack({ tag: 'forms.applyEffects', result });
    return this.finishMutation(session, { tag: 'forms.applyEffects', result }, req.artifactPath);
  }

  private handleFormsExport(
    req: FormsExportWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
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
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const result = mutator.importData(req.data, req.format, signal);
    return this.finishMutation(session, { tag: 'forms.import', result }, req.artifactPath);
  }

  private handleFormsRepair(
    req: FormsRepairWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const result = mutator.repair(req.bakeAppearances ?? false, signal);
    return this.finishMutation(session, { tag: 'forms.repair', result }, req.artifactPath);
  }

  private handleFormsCreateField(
    req: FormsCreateFieldWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const { field } = mutator.createField(req.draft, signal);
    return this.finishMutation(
      session,
      { tag: 'forms.createField', result: { field, meta: EMPTY_FORM_META } },
      req.artifactPath,
    );
  }

  private handleFormsUpdateField(
    req: FormsUpdateFieldWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const { field } = mutator.updateField(req.ref, req.patch, signal);
    return this.finishMutation(
      session,
      { tag: 'forms.updateField', result: { field, meta: EMPTY_FORM_META } },
      req.artifactPath,
    );
  }

  private handleFormsDeleteField(
    req: FormsDeleteFieldWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const { deletedFieldObjectNumber, detachedWidgets } = mutator.deleteField(req.ref, signal);

    // Cascade: the mutator detached the widgets (inert annotations now);
    // deleting them through the annotation feature keeps /Annots
    // bookkeeping, weak-ref invalidation, and page revisions in ONE place.
    const annotations = new AnnotationMutator(this.runtime, session);
    for (const widget of detachedWidgets) {
      if (widget.annotObjectNumber <= 0 || widget.pageObjectNumber <= 0) continue;
      annotations.delete(
        {
          kind: 'objectNumber',
          pageObjectNumber: widget.pageObjectNumber,
          annotObjectNumber: widget.annotObjectNumber,
        },
        signal,
      );
    }
    // The annotation deletes above mutated /Annots after the form
    // mutator's own bump; bump again so the form-model cache rebuilds.
    session.noteMutation();

    return this.finishMutation(
      session,
      {
        tag: 'forms.deleteField',
        result: {
          deletedFieldObjectNumber,
          removedWidgets: detachedWidgets,
          meta: EMPTY_FORM_META,
        },
      },
      req.artifactPath,
    );
  }

  private handleFormsAttachWidget(
    req: FormsAttachWidgetWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const { field } = mutator.attachWidget(req.ref, req.widget, req.onState, signal);
    return this.finishMutation(
      session,
      { tag: 'forms.attachWidget', result: { field, meta: EMPTY_FORM_META } },
      req.artifactPath,
    );
  }

  private handleFormsDetachWidget(
    req: FormsDetachWidgetWorkerRequest,
    signal: AbortSignal,
  ): WirePack<WorkerResultPayload> {
    const session = this.requireSession(req);
    const mutator = new FormMutator(this.runtime, session);
    const { field } = mutator.detachWidget(req.ref, req.widget, signal);
    return this.finishMutation(
      session,
      { tag: 'forms.detachWidget', result: { field, meta: EMPTY_FORM_META } },
      req.artifactPath,
    );
  }

  private finishMutation<P extends WorkerResultPayload>(
    session: DocumentSession,
    payload: P,
    artifactPath?: string,
  ): WirePack<WorkerResultPayload> {
    // Every successful mutation funnels through here; the sequence bump
    // invalidates version-keyed caches (the forms model). Forms mutators
    // bump themselves before reading back, so their tags are skipped to
    // avoid rebuilding the model cache twice per write — as do the
    // flattener and redaction applier, which note the mutation before
    // their post-apply annotation re-read.
    if (
      !payload.tag.startsWith('forms.') &&
      payload.tag !== 'pages.flatten' &&
      payload.tag !== 'redaction.apply'
    ) {
      session.noteMutation();
    }
    if (session.kind !== 'layer') {
      return wirePack(payload);
    }
    const saved = this.saveLayerArtifact(session, artifactPath);
    return wirePack({ ...payload, ...saved.payload }, saved.transfer);
  }

  private saveLayerArtifact(session: DocumentSession, artifactPath?: string): LayerArtifactSave {
    const saver = new DocumentSaver(this.runtime, session);
    if (artifactPath) {
      const artifactFile = saver.saveLayerArtifactToFile(artifactPath);
      return { payload: { artifactFile }, transfer: [] };
    }
    const artifact = saver.saveLayerArtifact();
    return { payload: { artifact }, transfer: [artifact.bytes] };
  }
}

interface LayerArtifactSave {
  payload: { artifact: { bytes: ArrayBuffer; size: number } } | { artifactFile: { path: string } };
  transfer: ArrayBuffer[];
}

/** Form mutations are non-structural at the page-list level. */
const EMPTY_FORM_META: MutationMeta = { affectedPages: [], cacheDelta: null };

const BASE_SESSION_SUFFIX = '__base__';

function sessionKey(docId: string, layerName?: string): string {
  return `${docId}::${layerName ? `layer:${layerName}` : BASE_SESSION_SUFFIX}`;
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
