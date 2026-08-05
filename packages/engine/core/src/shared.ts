/**
 * Zod-free shared domain surface.
 *
 * This entry is the overlap between runtime implementations and wire schemas:
 * stable DTO types, identity helpers, revision helpers, mutation result types,
 * and the shared engine error taxonomy. It deliberately excludes engine
 * handles, AbortablePromise, worker protocol, wire schemas, and conformance.
 */

export type {
  OpenInput,
  OpenInputBytes,
  OpenInputLayerBytes,
  OpenInputLayerSource,
  OpenInputById,
  OpenInputToken,
  OpenOptions,
  TokenSource,
} from './dto/OpenInput';
export type { DocumentMetadata, DocumentMetadataTrapped } from './dto/DocumentMetadata';
export type { MetadataPatch } from './dto/MetadataPatch';
export type { PageListSnapshot } from './dto/PageListSnapshot';
export type { PageLayout, PageBoxes, PageRotation } from './dto/PageLayout';
export type {
  PdfActionType,
  PdfActionNode,
  PdfActionWarning,
  PdfActionTree,
  PdfFieldActions,
  PdfPageActions,
  PdfAnnotationActions,
  NamedJavaScriptAction,
  DocumentActionsSnapshot,
  ActionReadBudget,
} from './dto/PdfAction';

// Canonical PDF-document geometry vocabulary (y-up, edges, browser-free).
export type {
  PdfPoint,
  PdfRect,
  PdfSize,
  PdfQuad,
  PdfRotation,
  PdfOriginSize,
  PdfQuadCorners,
  LinePoints,
  InkStroke,
  InkList,
  CalloutLine,
} from './geometry';
export {
  normalizePdfRect,
  pdfRectWidth,
  pdfRectHeight,
  pdfRectSize,
  pdfRectToOriginSize,
  pdfRectFromOriginSize,
  pdfQuadBounds,
  pdfQuadCorners,
  pdfQuadFromCorners,
} from './geometry';
export type { PageTextSnapshot } from './dto/PageTextSnapshot';
export type {
  PageGeometryGlyph,
  PageGeometryRun,
  PageGeometrySnapshot,
} from './dto/PageGeometrySnapshot';
export type {
  PageImageHandle,
  PageImageBlobSource,
  PageImageOptions,
  PageImageObjectUrl,
  PageImageResult,
  PageImageSource,
  PageNetworkRenderFormat,
  PageRaster,
  PageRenderBackground,
  PageRenderEncodedFormat,
  PageRenderFormat,
  PageRenderOptions,
  PageRenderQuery,
  PageRenderTarget,
  PageRenderViewport,
} from './dto/PageRender';
export { createPageImageHandle } from './dto/PageRender';
export type {
  AnnotationAppearanceMode,
  AnnotationAppearanceRenderOptions,
  AnnotationAppearanceImageOptions,
  AnnotationAppearancesQuery,
  AnnotationAppearanceRaster,
  AnnotationAppearancesResult,
  AnnotationAppearanceImage,
  AnnotationAppearanceImagesResult,
  AnnotationAppearanceManifestEntry,
  AnnotationAppearanceManifest,
} from './dto/AnnotationRender';
export type { CachePins } from './dto/CachePins';
export { DEFAULT_PDF_SAVE_MODE } from './dto/PdfSaveMode';
export type { PdfSaveMode } from './dto/PdfSaveMode';
export type { FontHandle, FontKey, FontSpec } from './dto/FontSpec';

export { EngineError, serializeError, deserializeError } from './errors/EngineError';
export type { SerializedEngineError, EngineErrorOptions } from './errors/EngineError';
export { EngineErrorCode } from './errors/EngineErrorCode';

export { isValidPageObjectNumber } from './identity/PageObjectNumber';
export type { PageObjectNumber } from './identity/PageObjectNumber';
export type { AnnotationStableId } from './identity/AnnotationStableId';
export { encodeStableIdKey, decodeStableIdKey } from './identity/AnnotationStableId';
export type { AnnotationRef } from './identity/AnnotationRef';
export type { AnnotationIdentityQuality } from './identity/AnnotationIdentityQuality';

export { revisionTokensEqual } from './revision/RevisionToken';
export type { RevisionToken } from './revision/RevisionToken';
export type { PageState } from './revision/PageState';
export {
  UNKNOWN_WEAK_ANNOTATION_STATE,
  knownWeakAnnotationState,
} from './revision/WeakAnnotationState';
export type { WeakAnnotationState } from './revision/WeakAnnotationState';

export type {
  Color,
  Point,
  Rect,
  Size,
  Rotation,
  LineEnding,
  LineEndings,
  AnnotationFlags,
  AnnotationReplyType,
  AnnotationBorderStyle,
  PdfRectDifferences,
  StandardFont,
  FreeTextFont,
  TextAlignment,
  FreeTextIntent,
  CaretIntent,
  StrikeoutIntent,
  InkIntent,
  BlendMode,
} from './annotation/primitives';
export { NO_ANNOTATION_FLAGS } from './annotation/primitives';

export type { AnnotationBase } from './annotation/base';
export type { AnnotationDraftBase } from './annotation/draft-base';
export type { AnnotationPatchBase } from './annotation/patch-base';
export {
  ANNOTATION_SUBTYPES,
  PdfAnnotationSubtypeCode,
  PDF_CODE_TO_SUBTYPE,
  PDF_SUBTYPE_TO_CODE,
  subtypeFromCode,
} from './annotation/subtype';
export type { AnnotationSubtype } from './annotation/subtype';

// Inline binary payloads (stamp images, future embedded files) — zod-free.
export type {
  BinarySource,
  BinaryPayload,
  WireResource,
  WireResourceMap,
  ResourceRef,
} from './resource/BinarySource';
export { resolveBinarySource } from './resource/BinarySource';
export type { BinaryMetadata, BinaryMimeType } from './resource/binaryMetadata';
export { sniffBinaryMetadata } from './resource/binaryMetadata';
export { normalizeAnnotationDraft, normalizeAnnotationPatch } from './annotation/normalize';
// Deep import keeps `shared` zod-free (the kind barrel pulls schemas).
export { normalizeAttachmentFileSource } from './annotation/kinds/file-attachment/normalize';
export type { NormalizedDraft, NormalizedPatch } from './annotation/normalize';

// Attachment vocabulary — one set of file metadata fields shared by the
// file-attachment kind and the document-level EmbeddedFiles service.
export type {
  AttachmentFileBase,
  AttachmentFileSource,
  AttachmentFileInfo,
  EmbeddedFileItem,
  EmbeddedFileRef,
  AttachmentContent,
} from './dto/Attachment';
export type {
  AttachmentCreateResult,
  AttachmentDeleteResult,
  AttachmentsCache,
} from './mutation/AttachmentMutationResults';

export type {
  AnnotationKindModule,
  DTOOfKind,
  DraftOfKind,
  PatchOfKind,
} from './annotation/registry';
export type {
  AnnotationKind,
  AnnotationSubtypeOfKind,
  AnnotationDTO,
  AnnotationDraft,
  AnnotationPatch,
  WireAnnotationDraft,
  WireAnnotationPatch,
  HighlightAnnotationDTO,
  HighlightDraft,
  HighlightPatch,
  UnderlineAnnotationDTO,
  UnderlineDraft,
  UnderlinePatch,
  SquigglyAnnotationDTO,
  SquigglyDraft,
  SquigglyPatch,
  StrikeoutAnnotationDTO,
  StrikeoutDraft,
  StrikeoutPatch,
  CircleAnnotationDTO,
  CircleDraft,
  CirclePatch,
  SquareAnnotationDTO,
  SquareDraft,
  SquarePatch,
  PolygonAnnotationDTO,
  PolygonDraft,
  PolygonPatch,
  PolylineAnnotationDTO,
  PolylineDraft,
  PolylinePatch,
  LineAnnotationDTO,
  LineDraft,
  LinePatch,
  LinkAnnotationDTO,
  LinkDraft,
  LinkPatch,
  InkAnnotationDTO,
  InkDraft,
  InkPatch,
  FreeTextAnnotationDTO,
  FreeTextDraft,
  FreeTextPatch,
  CaretAnnotationDTO,
  CaretDraft,
  CaretPatch,
  RedactAnnotationDTO,
  RedactDraft,
  RedactPatch,
  TextAnnotationDTO,
  TextDraft,
  TextPatch,
  NoteIcon,
  StampAnnotationDTO,
  StampDraft,
  StampPatch,
  StampWireDraft,
  StampWirePatch,
  StampFit,
  FileAttachmentAnnotationDTO,
  FileAttachmentDraft,
  FileAttachmentWireDraft,
  FileAttachmentPatch,
  FileAttachmentIcon,
  WireAttachmentFile,
  ShapeAnnotationFields,
  ShapeDraftFields,
  ShapePatchFields,
  ColorStyleFields,
  ColorStyleDraftFields,
  ColorStylePatchFields,
  GeometryStyleFields,
  GeometryStyleDraftFields,
  GeometryStylePatchFields,
  FilledStyleFields,
  FilledStyleDraftFields,
  FilledStylePatchFields,
  VertexAnnotationFields,
  VertexDraftFields,
  VertexPatchFields,
  UnsupportedAnnotationDTO,
  UnsupportedDraft,
  UnsupportedPatch,
  WidgetAnnotationDTO,
  WidgetDraft,
  WidgetPatch,
} from './annotation/kinds';

export type {
  AnnotationListPageSnapshot,
  AnnotationListSnapshotAllPages,
} from './annotation/AnnotationListSnapshot';

export { classifyRelation, buildThreads, refKey } from './annotation/relationships';
export type { AnnotationRelationKind, AnnotationThread } from './annotation/relationships';

export type { DocumentManifest, ManifestPage } from './dto/DocumentManifest';
export type { LayerScopes, LayerScopePlane } from './dto/LayerScopes';
export type { PdfDestination } from './dto/PdfDestination';
export type { PdfLinkTarget, PdfLinkTargetWritable } from './dto/PdfLinkTarget';
export type { CacheDelta, MutationMeta } from './mutation/MutationMeta';
export type { AnnotationListMutationMeta } from './mutation/AnnotationListMutationMeta';
export {
  changesAnnotationList,
  shiftsExistingAnnotationIndices,
  invalidatesWeakIndexRefs,
} from './mutation/AnnotationMutationImpactPolicy';
export type { AnnotationMutationKind } from './mutation/AnnotationMutationImpactPolicy';
export type { RefetchReason } from './mutation/RefetchReason';
export type {
  AnnotationCreateResult,
  AnnotationUpdateResult,
  AnnotationDeleteResult,
  AnnotationMoveResult,
} from './mutation/AnnotationMutationResults';
export type {
  AppearanceAction,
  AppearanceImpact,
  AppearanceOutcome,
} from './annotation/appearance';
export { appearanceImpactOf, semanticEqual } from './annotation/appearance';
export type { FormFieldRef, FormWidgetRef } from './identity/FormFieldRef';
export { encodeFieldRefKey, decodeFieldRefKey } from './identity/FormFieldRef';
export type {
  FormFieldFamily,
  FormFieldOrigin,
  FormFieldFlags,
  ToggleFieldWidget,
  FormFieldOption,
  FormFieldBase,
  TextFieldDTO,
  CheckboxFieldDTO,
  RadioFieldDTO,
  ComboBoxFieldDTO,
  ListBoxFieldDTO,
  PushButtonFieldDTO,
  SignatureFieldDTO,
  UnknownFieldDTO,
  FormFieldDTO,
} from './forms/field';
export type { FormValueEntry } from './forms/value-entry';
export type {
  WidgetStyleFields,
  WidgetStyleDraftFields,
  WidgetStylePatchFields,
} from './annotation/kinds/widget.shared';
export type { FormKind, FormSnapshot } from './forms/snapshot';
export type {
  WidgetAppearance,
  WidgetPlacement,
  FormFieldOptionInput,
  TextFieldDraft,
  CheckboxFieldDraft,
  RadioFieldDraft,
  ComboBoxFieldDraft,
  ListBoxFieldDraft,
  FormFieldDraft,
} from './forms/draft';
export type {
  TextFieldPatch,
  CheckboxFieldPatch,
  RadioFieldPatch,
  ComboBoxFieldPatch,
  ListBoxFieldPatch,
  FormFieldPatch,
} from './forms/patch';
export type { FormFieldValue, FormDataFormat } from './forms/value';
export type {
  FormFieldDisplay,
  FormEffect,
  FormEffectStatus,
  FormEffectResult,
  FormEffectsResult,
} from './forms/effects';
export type {
  FormSetValueResult,
  FormImportResult,
  FormDataExport,
  FormRepairResult,
  FormFieldCreateResult,
  FormFieldUpdateResult,
  FormFieldDeleteResult,
  FormWidgetLinkResult,
} from './mutation/FormMutationResults';
// Search: contract types + the pure match/anchor stages. The matcher and
// line-merge are exported (not just types) because the local worker, the
// server, and the conformance suite all run the SAME code — parity between
// engines is a design invariant, not a test hope.
export type {
  SearchQuery,
  SearchMode,
  SearchSliceBudget,
  SearchRequest,
  SearchSnippet,
  SearchMatch,
  SearchSlice,
} from './search/types';
export { SEARCH_FOLD_VERSION, foldText, toOriginalRange } from './search/fold';
export type { FoldOptions, FoldedText, SearchMatchRange } from './search/fold';
export { foldOptionsFor, matchLiteral, wordAt, wordBefore } from './search/literal';
export {
  SEARCH_REGEX_MAX_LENGTH,
  validateSearchRegex,
  validateSearchQuery,
  matchRegex,
} from './search/regex';
export type {
  SearchRegexIssue,
  SearchRegexValidation,
  SearchQueryIssue,
  SearchQueryValidation,
} from './search/regex';
export { matchPageText } from './search/matcher';
export { SEARCH_SNIPPET_CONTEXT, buildSnippet } from './search/snippet';
export { searchRectsForRange } from './search/rects';
export { searchContentEpoch, canonicalSearchQuery } from './search/epoch';

export type { PageMoveInput } from './mutation/PageMoveInput';
export type { PageMoveResult, PageMoveCache } from './mutation/PageMoveResult';
export type { PageStructureCache } from './mutation/PageStructureCache';
export type { PageRotateInput } from './mutation/PageRotateInput';
export type { PageRotateResult } from './mutation/PageRotateResult';
export type { PageDeleteInput } from './mutation/PageDeleteInput';
export type { PageDeleteResult } from './mutation/PageDeleteResult';
export type { PageInsertResult } from './mutation/PageInsertResult';
export type {
  PageFlattenInput,
  PageFlattenUsage,
  PageFlattenStatus,
  PageFlattenItemResult,
  PageFlattenResult,
} from './mutation/PageFlattenResult';
export type {
  RedactionApplyScope,
  RedactionApplyStatus,
  RedactionApplyItemResult,
  RedactionApplyResult,
} from './mutation/RedactionApplyResult';
export type { MetadataUpdateResult, MetadataCache } from './mutation/MetadataUpdateResult';

export type {
  AnnotationActor,
  CollabAction,
  CollabEntity,
  CollabFilter,
  DocCapability,
  IdentityClaims,
  ParsedCapability,
  ParsedCollab,
  ParsedScope,
  ParsedVirtual,
  ParsedWildcard,
  PdfBits,
} from './auth/scope';
export { PDF_BITS, decodePdfBits } from './auth/scope';
export { parseScope, validateScopeArray } from './auth/scope';
export { InvalidScope, MissingIdentity, PermissionDenied } from './auth/scope';
export type { CollabTarget } from './auth/scope';
export {
  checkAnyCapability,
  checkCapability,
  checkCollab,
  checkSetGroup,
  expandedCapabilities,
  expandRawScope,
  filterMatches,
} from './auth/scope';
export { caps, collab, materializePdfPermissions, pdfPermissions } from './auth/scope';

// NOTE: CDN-shaped surface (DOC_RESOURCES, cdnCoverageForScope, applyCdnAccess,
// CdnCoverageEntry, etc.) is deliberately NOT re-exported here. It lives under
// `@embedpdf/engine-core/wire` only, because it is HTTP-wire territory: server
// route guards and the cloud SDK consume it, and engine-local must not pull it
// into its bundle. See ENGINE_CORE_BOUNDARIES.md (or wire/cdn/README.md) for
// the rationale and where to import from.
