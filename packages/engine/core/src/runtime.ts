/**
 * Zod-free engine runtime entrypoint.
 *
 * Local/browser engines and service implementations import this subpath for
 * engine handles, AbortablePromise, worker protocol, transport helpers, and
 * the shared zod-free domain surface.
 */

export * from './shared';

export { AbortablePromise } from './promise/AbortablePromise';
export type { AbortableExecutor } from './promise/AbortablePromise';
export { AbortError, isAbortError } from './promise/AbortError';

export type { Engine, EngineFactory } from './engine/Engine';
export type { FontService } from './engine/FontService';
export type { DocumentFontSettings, FontEmbeddingPolicy } from './engine/DocumentFontSettings';
export type { DocumentHandle } from './engine/DocumentHandle';
export type {
  DocumentEvent,
  DocumentEventInit,
  DocumentEventType,
  EventOrigin,
} from './events/DocumentEvent';
export type { DocumentEventStream } from './events/DocumentEventStream';
export {
  advisoryFromPdfBits,
  permissionInfoFromProbe,
  permissionInfoWithAdvisory,
  securityStateFromHead,
  securityStateFromProbe,
} from './engine/document-security-state';
export type {
  CdnAccessInfo,
  CdnAdapter,
  DocumentAccessInfo,
  DocumentAccessReason,
  DocumentEncryptionState,
  DocumentOpenMode,
  DocumentSecurityService,
  DocumentSecurityState,
  DocumentUnlockInput,
  DocumentUnlockResult,
  PdfPermissionAdvisory,
  PdfPermissionInfo,
} from './engine/DocumentSecurityService';
export {
  CONTINUOUS_RENDER_POLICY,
  appearanceLatticeScale,
  snapAppearanceScale,
  snapFullPageViewport,
  snapTileScale,
} from './engine/DocumentRenderService';
export type { DocumentRenderService, EngineRenderPolicy } from './engine/DocumentRenderService';
export { passwordPromptFromState } from './engine/passwordPrompt';
export type { PasswordPrompt } from './engine/passwordPrompt';
export type { DocumentCapabilities } from './engine/DocumentHandle';
export type { MetadataService } from './engine/MetadataService';
export type { PageHandle } from './engine/PageHandle';
export type { PageMeasureService } from './engine/PageMeasureService';
export type {
  MeasureViewportsWorkerRequest,
  MeasureSetScaleWorkerRequest,
} from './wire/worker-protocol';
export type { DocumentAnnotationsService } from './engine/DocumentAnnotationsService';
export type { DocumentActionsService } from './engine/DocumentActionsService';
export type { DocumentFormsService, FormRepairOptions } from './engine/DocumentFormsService';
export type { DocumentSearchService } from './engine/DocumentSearchService';
export type { WeakAnnotationEditSession } from './engine/DocumentAnnotationsService';
export type { DocumentPagesService } from './engine/DocumentPagesService';
export type { DocumentRedactionService } from './engine/DocumentRedactionService';
export type { DocumentSignaturesService } from './engine/DocumentSignaturesService';
export type { PageAnnotationsService } from './engine/PageAnnotationsService';
export type { DocumentAttachmentsService } from './engine/DocumentAttachmentsService';
export type { PieceInfoService } from './engine/PieceInfoService';
export type {
  PieceInfoEntry,
  PieceInfoPatch,
  PieceInfoPatchValue,
  PieceInfoSnapshot,
} from './dto/PieceInfo';
export type { PageTextService } from './engine/PageTextService';
export type { PageRenderService } from './engine/PageRenderService';

export { wirePack, EMPTY_TRANSFER } from './wire/WirePack';
export type { WirePack } from './wire/WirePack';

export type {
  WorkerJobId,
  WorkerRequest,
  WorkerResponse,
  WorkerResultPayload,
  WorkerLifecycleMessage,
  OpenWorkerRequest,
  OpenFatMemoryWorkerRequest,
  OpenLayerMemoryBaseWorkerRequest,
  OpenLayerFileBaseWorkerRequest,
  LayerOpenSource,
  MetadataReadWorkerRequest,
  MetadataUpdateWorkerRequest,
  ActionsReadWorkerRequest,
  AnnotationsListWorkerRequest,
  AnnotationsRenderAppearancesWorkerRequest,
  AnnotationsRenderAppearancesEncodedWorkerRequest,
  AnnotationAppearancesEncodedResultWire,
  EncodedAppearanceWire,
  EncodedImageWire,
  RenderEncode,
  AnnotationsCreateWorkerRequest,
  AnnotationsUpdateWorkerRequest,
  AnnotationsDeleteWorkerRequest,
  AnnotationsMoveWorkerRequest,
  DocumentSaveBufferWorkerRequest,
  DocumentSaveLayerBufferWorkerRequest,
  DocumentSaveFileWorkerRequest,
  DocumentCheckPasswordPermissionsWorkerRequest,
  DocumentProbeSecurityFileWorkerRequest,
  DocumentRenderPageFileWorkerRequest,
  DocumentRenderPageFileEncodedWorkerRequest,
  DocumentSecurityProbeInfo,
  PagesListWorkerRequest,
  SignaturesListWorkerRequest,
  SignaturesContentsWorkerRequest,
  SignaturesDigestWorkerRequest,
  SignaturesRevisionBytesWorkerRequest,
  DocumentVersionWorkerRequest,
  SignaturesPrepareWorkerRequest,
  SignaturesCompleteWorkerRequest,
  SignaturesCancelWorkerRequest,
  SignaturesAnalyzeWorkerRequest,
  SignaturesFinalizeCandidateWorkerRequest,
  PagesMoveWorkerRequest,
  PagesRotateWorkerRequest,
  PagesDeleteWorkerRequest,
  AnnotationsFlattenWorkerRequest,
  AnnotationsExportAppearanceWorkerRequest,
  PagesSetNameWorkerRequest,
  PagesRemoveNameWorkerRequest,
  PagesExtractWorkerRequest,
  PagesInsertWorkerRequest,
  PagesInsertBlankWorkerRequest,
  PagesFlattenWorkerRequest,
  RedactionApplyWorkerRequest,
  PieceInfoReadWorkerRequest,
  PieceInfoUpdateWorkerRequest,
  PieceInfoApplicationsWorkerRequest,
  PieceInfoClearWorkerRequest,
  PagesTextWorkerRequest,
  PagesGeometryWorkerRequest,
  PagesRenderWorkerRequest,
  PagesRenderEncodedWorkerRequest,
  SearchQueryWorkerRequest,
  SearchScanRequest,
  FormsListWorkerRequest,
  FormsSetValueWorkerRequest,
  FormsResetWorkerRequest,
  FormsApplyEffectsWorkerRequest,
  FormsExportWorkerRequest,
  FormsImportWorkerRequest,
  FormsRepairWorkerRequest,
  FormsCreateFieldWorkerRequest,
  FormsUpdateFieldWorkerRequest,
  FormsSetSignatureAppearanceWorkerRequest,
  FormsDeleteFieldWorkerRequest,
  FormsAttachWidgetWorkerRequest,
  FormsDetachWidgetWorkerRequest,
  FontsRegisterWorkerRequest,
  FontsAddFallbackWorkerRequest,
  FontsClearFallbacksWorkerRequest,
  FontsClearWorkerRequest,
  FontsAuthorizeEditingWorkerRequest,
  DocumentSetFontSettingsWorkerRequest,
  CloseWorkerRequest,
  LayerCloseWorkerRequest,
  AbortWorkerRequest,
  ShutdownWorkerRequest,
  AttachmentsListWorkerRequest,
  AttachmentsReadFileWorkerRequest,
  AttachmentsCreateWorkerRequest,
  AttachmentsDeleteWorkerRequest,
  AnnotationsReadFileWorkerRequest,
  AnnotationsReadAppearanceWorkerRequest,
  AnnotationsExportWorkerRequest,
  AnnotationsImportWorkerRequest,
  AttachmentFileWorkerPayload,
  LayerArtifactWorkerPayload,
  LayerArtifactFileWorkerPayload,
} from './wire/worker-protocol';
