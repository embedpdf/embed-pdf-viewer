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
export { devWarn, isDev, resetDevWarnings } from './dev';

export type { Engine, EngineFactory } from './engine/Engine';
export { isLocalEngine } from './engine/LocalEngine';
export type { LocalEngine } from './engine/LocalEngine';
export { isLocalDocument } from './engine/LocalDocumentHandle';
export type { LocalDocumentHandle } from './engine/LocalDocumentHandle';
export { isLocalPage } from './engine/LocalPageHandle';
export type { LocalPageHandle } from './engine/LocalPageHandle';
export { LOCAL_ENGINE_BRAND } from './engine/localEngineBrand';
export type { FontService } from './engine/FontService';
export type {
  DocumentFontsService,
  FontEmbeddingPolicy,
  LocalDocumentFontsService,
} from './engine/DocumentFontsService';
export type { DocumentHandle, DocumentGrant } from './engine/DocumentHandle';
export type {
  DocumentEvent,
  DocumentEventInit,
  DocumentEventOf,
  DocumentEventType,
  EventOrigin,
} from './events/DocumentEvent';
export type { DocumentEventStream } from './events/DocumentEventStream';
export { subscribeToType } from './events/DocumentEventStream';
export { EventHub, SessionEventPublisher } from './events/EventHub';
export { changeEvents } from './events/changeEvents';
export {
  advisoryFromPdfBits,
  permissionInfoFromProbe,
  permissionInfoWithAdvisory,
  securityStateFromHead,
  securityStateFromProbe,
} from './engine/document-security-state';
export type {
  AnnotationOwner,
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
export type { CallFacts, CallPriority, WorkingSetPage } from './scheduling/facts';
export { clearlyOutranks, placeFor, placeIn, placedBefore, rank } from './scheduling/place';
export type { JobTarget, Place, Placed, RankedJob, ViewSets } from './scheduling/place';
export { passwordPromptFromState } from './engine/passwordPrompt';
export type { PasswordPrompt } from './engine/passwordPrompt';
export type { MetadataService } from './engine/MetadataService';
export type { DocumentOutlineService, OutlineCreateOptions } from './engine/DocumentOutlineService';
export { attachmentVerbs, type AttachmentWriteVerb } from './engine/attachmentVerbs';
export { outlineVerbs } from './engine/outlineVerbs';
export { pageVerbs, type PageStructureVerb } from './engine/pageVerbs';
export type { CustomMetadataService } from './engine/CustomMetadataService';
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
export type { DocumentPagesService } from './engine/DocumentPagesService';
export type { DocumentRedactionService } from './engine/DocumentRedactionService';
export type { DocumentSignaturesService } from './engine/DocumentSignaturesService';
export type {
  LocalPageAnnotationsService,
  PageAnnotationsService,
} from './engine/PageAnnotationsService';
export type { LocalPageFormsService, PageFormsService } from './engine/PageFormsService';
export type { DocumentAttachmentsService } from './engine/DocumentAttachmentsService';
export type {
  PieceInfoDeleteResult,
  PieceInfoService,
  PieceInfoUpdateResult,
} from './engine/PieceInfoService';
export type {
  PieceInfoEntry,
  PieceInfoPatch,
  PieceInfoPatchValue,
  PieceInfoSnapshot,
} from './dto/PieceInfo';
export type { PageTextService } from './engine/PageTextService';
export type { PageRenderService, RawPageRenderService } from './engine/PageRenderService';

export { wirePack, EMPTY_TRANSFER } from './wire/WirePack';
export type { WirePack } from './wire/WirePack';

export type {
  WorkerJobId,
  RequestEffect,
  WorkerRequest,
  WorkerJobRequest,
  WorkerControlMessage,
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
  MetadataReadCustomWorkerRequest,
  MetadataUpdateCustomWorkerRequest,
  ActionsReadWorkerRequest,
  OutlineReadWorkerRequest,
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
  AnnotationsReorderWorkerRequest,
  DocumentApplyWorkerRequest,
  DocumentApplyChangesWorkerRequest,
  ChangeRecordPayload,
  ServerChange,
  ServerChangeOutcome,
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
  AnnotationsFlattenWorkerRequest,
  AnnotationsExportAppearanceWorkerRequest,
  PagesSetNameWorkerRequest,
  PagesRemoveNameWorkerRequest,
  PagesExtractWorkerRequest,
  PagesFlattenWorkerRequest,
  RedactionApplyWorkerRequest,
  PieceInfoReadWorkerRequest,
  PieceInfoUpdateWorkerRequest,
  PieceInfoApplicationsWorkerRequest,
  PieceInfoDeleteWorkerRequest,
  PagesTextWorkerRequest,
  PagesGeometryWorkerRequest,
  PagesRenderWorkerRequest,
  PagesRenderEncodedWorkerRequest,
  SearchQueryWorkerRequest,
  SearchScanRequest,
  FormsListWorkerRequest,
  FormsSetValueWorkerRequest,
  FormsResetWorkerRequest,
  FormsExportWorkerRequest,
  FormsImportWorkerRequest,
  FormsImportValuesWorkerRequest,
  FormsRepairWorkerRequest,
  FormsCreateFieldWorkerRequest,
  FormsUpdateFieldWorkerRequest,
  FormsSetSignatureAppearanceWorkerRequest,
  FormsDeleteFieldWorkerRequest,
  FormsAddWidgetWorkerRequest,
  FormsDetachWidgetWorkerRequest,
  FormsDeleteWidgetWorkerRequest,
  FormsReorderWidgetsWorkerRequest,
  FormsReorderCalculationsWorkerRequest,
  FormsUpdateWidgetWorkerRequest,
  FontsRegisterWorkerRequest,
  FontsAddFallbackWorkerRequest,
  FontsClearFallbacksWorkerRequest,
  FontsClearWorkerRequest,
  FontsAuthorizeEditingWorkerRequest,
  FontsListWorkerRequest,
  FontsProgramWorkerRequest,
  DocumentSetFontSettingsWorkerRequest,
  DocumentFontsListWorkerRequest,
  DocumentFontsResolveWorkerRequest,
  DocumentFontsProgramWorkerRequest,
  CloseWorkerRequest,
  LayerCloseWorkerRequest,
  AbortWorkerRequest,
  PagesWorkingSetWorkerRequest,
  ShutdownWorkerRequest,
  AttachmentsListWorkerRequest,
  AttachmentsReadFileWorkerRequest,
  AnnotationsReadFileWorkerRequest,
  AnnotationsReadAppearanceWorkerRequest,
  AnnotationsExportWorkerRequest,
  AnnotationsImportWorkerRequest,
  AttachmentFileWorkerPayload,
  LayerArtifactWorkerPayload,
  LayerArtifactFileWorkerPayload,
  WritePayloadFacts,
} from './wire/worker-protocol';
export {
  canChooseProgram,
  documentFontNameOf,
  documentFontsOf,
  documentProgramForName,
  downloadableProgram,
  FALLBACK_TIERS,
  fontListOf,
  fontResolutionOf,
  listedProgram,
  restrictionsOfProgram,
  standardFontOfBaseFont,
  TEXT_WRITING_CAPABILITIES,
  type BuiltInPrograms,
  type DocumentFace,
  type DocumentFaceFacts,
  type DocumentFontFacts,
  type EngineFontFacts,
  type FallbackTier,
  type FontListFacts,
  type FontProgramFacts,
  type ResolvedRunFacts,
} from './fonts/fontList';
