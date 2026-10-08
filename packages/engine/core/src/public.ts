/**
 * The developer-facing surface both engine packages re-export
 * (`@embedpdf/engine` and `@cloudpdf/engine`), so an app imports everything
 * it names from its engine package and the two can't drift apart. Zod-free.
 * Engine-specific additions (the factories, the local engine's font service)
 * stay in each package.
 */

// Errors and cancelling.
export { AbortablePromise } from './promise/AbortablePromise';
export { AbortError, isAbortError } from './promise/AbortError';
export { EngineError } from './errors/EngineError';
export { EngineErrorCode } from './errors/EngineErrorCode';

// Local engine.
export { isLocalEngine } from './engine/LocalEngine';
export { isLocalDocument } from './engine/LocalDocumentHandle';
export { isLocalPage } from './engine/LocalPageHandle';

// Refs.
export { toPageRef, pageRefsEqual } from './identity/PageRef';
export { OBJECT_NUMBER_CEILING } from './identity/ObjectNumbers';
export { toFieldRef } from './identity/FormFieldRef';
export { toAttachmentRef } from './dto/Attachment';
export { annotationKey } from './identity/annotationKey';

// Positions: where rows go in their list (a reorder, an insert).
export { anchorOf, reorderedList } from './mutation/ListPosition';
export type { AnnotationPosition, ListPosition, PagePosition } from './mutation/ListPosition';

// Permissions.
export { caps, collab } from './auth/scope/builders';

// Text and search.
export { charRangeForTextOffsets } from './text/charmap';
export { isRotatedGeometryRun } from './dto/PageGeometrySnapshot';
export { validateSearchQuery } from './search/regex';

// Annotations.
export {
  annotationOfDraft,
  appearanceTurnOf,
  applyAnnotationPatch,
  drawnPointsOf,
  resolveAnnotationDraft,
  resolveAnnotationPatch,
  shapeForRect,
} from './pageSpace/helpers';
export type { DraftAttribution, DraftContext } from './annotation/resolve/annotationOfDraft';
export { shownAppearances } from './dto/AnnotationRender';
export { ANNOTATION_DEFAULTS, type AnnotationDefaults } from './annotation/defaults';
export { buildCommentThreads } from './annotation/comments';
export { AnnotationTransfer } from './transfer/AnnotationTransfer';
export {
  formatMeasurement,
  measureFromKnownLength,
  measureFromRatio,
  measurementReadout,
  viewportForPoint,
} from './measure';

// Rendering.
export { snapFullPageViewport } from './engine/DocumentRenderService';
export { pageTransform } from './geometry/pageTransform';

// Page space and PDF space: for working beside a tool that reads the file's own numbers.
export {
  pageBoxOf,
  pagePointOf,
  pageQuadOf,
  pdfPointOf,
  pdfQuadOf,
  pdfRectOf,
} from './geometry/pageSpace';
export { pageDestinationOf, pdfDestinationOf } from './pageSpace/destinations';

export type {
  // Engine and handles.
  Engine,
  EngineFactory,
  DocumentHandle,
  PageHandle,
  LocalEngine,
  LocalDocumentHandle,
  LocalPageHandle,
  OpenInput,
  OpenInputBytes,
  OpenInputLayerBytes,
  OpenInputLayerFile,
  OpenInputById,
  OpenInputToken,
  OpenInputShare,
  OpenOptions,
  TokenSource,
  Identity,
  DocCapability,
  // Scheduling: what a call says (`doc.with`) and what a view shows (`doc.setWorkingSet`).
  CallFacts,
  CallPriority,
  WorkingSetPage,
  // Services.
  MetadataService,
  CustomMetadataService,
  DocumentPagesService,
  DocumentAnnotationsService,
  PageAnnotationsService,
  LocalPageAnnotationsService,
  PageTextService,
  PageRenderService,
  LocalPageRenderService,
  DocumentSecurityService,
  DocumentSecurityState,
  DocumentUnlockInput,
  DocumentUnlockResult,
  DocumentAccessInfo,
  PdfSaveMode,
  DownloadOptions,
  FlattenOptions,
  // Writes: how to write, and this session's object numbers.
  WriteOptions,
  Change,
  ChangeOp,
  ChangeItem,
  ChangeResult,
  ChangeItemType,
  SkippedChangeItem,
  AnnotationCreateOptions,
  AnnotationUpdateOptions,
  FlattenWriteOptions,
  PageInsertBlankOptions,
  FormFieldCreateOptions,
  FormWidgetAddOptions,
  ObjectNumberPool,
  ObjectNumberRange,
  ObjectNumbersLost,
  // Data.
  PageRef,
  PageLayout,
  PageListSnapshot,
  PageDestination,
  PdfDestination,
  PdfRect,
  PdfPoint,
  PdfQuad,
  PdfRotation,
  PdfTextSegment,
  PageTextSnapshot,
  PageGeometryRun,
  TextLayout,
  TextRange,
  PageTextRange,
  SearchQuery,
  SearchRequest,
  SearchLimit,
  SearchSlice,
  SearchMatch,
  SearchSnippet,
  PageRenderOptions,
  PageImageOptions,
  PageImageHandle,
  PageRaster,
  PageRenderImage,
  PageRenderRaster,
  PageRenderTransform,
  PageRenderMatrix,
  PageTransformOptions,
  PixelPoint,
  PixelBox,
  PixelQuad,
  AnnotationRef,
  Annotation,
  AnnotationDraft,
  AnnotationPatch,
  AnnotationSubtype,
  AnnotationBundle,
  AnnotationList,
  AnnotationListOptions,
  AnnotationCreateResult,
  AnnotationUpdateResult,
  AnnotationDeleteResult,
  AnnotationReorderResult,
  AnnotationImportResult,
  CommentThread,
  PdfMeasure,
  PdfMeasurement,
  PdfNumberFormat,
  LengthUnit,
  AreaUnit,
  MeasurementFormatOptions,
  MeasureFromRatioOptions,
  FormFieldRef,
  FormFieldDTO,
  Attachment,
  AttachmentList,
  AttachmentRef,
  DocumentEvent,
  DocumentEventOf,
  DocumentEventType,
  EventOrigin,
} from './runtime';
