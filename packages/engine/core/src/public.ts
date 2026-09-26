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

// Refs.
export { toPageRef, pageRefsEqual } from './identity/PageRef';
export { toFieldRef } from './identity/FormFieldRef';
export { annotationKey } from './identity/annotationKey';

// Permissions.
export { caps, collab } from './auth/scope/builders';

// Text and search.
export { charRangeForTextOffsets } from './text/charmap';
export { isRotatedGeometryRun } from './dto/PageGeometrySnapshot';
export { validateSearchQuery } from './search/regex';

// Annotations.
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

export type {
  // Engine and handles.
  Engine,
  EngineFactory,
  DocumentHandle,
  DocumentCapabilities,
  PageHandle,
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
  // Services.
  MetadataService,
  DocumentPagesService,
  DocumentAnnotationsService,
  PageAnnotationsService,
  PageTextService,
  PageRenderService,
  DocumentSecurityService,
  DocumentSecurityState,
  DocumentUnlockInput,
  DocumentUnlockResult,
  DocumentAccessInfo,
  PdfSaveMode,
  // Data.
  PageRef,
  PageLayout,
  PageListSnapshot,
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
  AnnotationRef,
  AnnotationDTO,
  AnnotationDraft,
  AnnotationPatch,
  AnnotationSubtype,
  AnnotationBundle,
  AnnotationList,
  AnnotationListOptions,
  AnnotationCreateResult,
  AnnotationUpdateResult,
  AnnotationDeleteResult,
  AnnotationMoveResult,
  AnnotationImportResult,
  CommentThread,
  FormFieldRef,
  FormFieldDTO,
  DocumentEvent,
  EventOrigin,
} from './runtime';
