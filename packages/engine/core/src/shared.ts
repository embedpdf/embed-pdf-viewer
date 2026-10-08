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
  OpenInputShare,
  OpenInputLayerFile,
  OpenInputLayerFileSource,
  OpenOptions,
  TokenSource,
} from './dto/OpenInput';
export type { DocumentMetadata, DocumentMetadataTrapped } from './dto/DocumentMetadata';
export type { MetadataPatch } from './dto/MetadataPatch';
export type { CustomMetadata } from './dto/CustomMetadata';
export type { CustomMetadataPatch } from './dto/CustomMetadataPatch';
export type { PageListSnapshot } from './dto/PageListSnapshot';
export type { NamedPageEntry, NamedPageTarget } from './dto/NamedPage';
export type { PageLayout, PageBoxes } from './dto/PageLayout';
export type {
  PdfActionType,
  PdfActionNode,
  PdfActionTargetRef,
  PdfActionWarning,
  PdfActionTree,
  PdfFieldActions,
  PdfPageActions,
  PdfAnnotationActions,
  NamedJavaScriptAction,
  DocumentActionsSnapshot,
  ActionReadBudget,
  SubmitFormFlags,
  SubmitFormPayload,
  PdfActionWrite,
  FieldScriptWrite,
  FieldScriptEvent,
  FieldActionsPatch,
  WidgetActionEvent,
  WidgetActionsPatch,
} from './dto/PdfAction';
export {
  actionWriteOf,
  decodeSubmitFormFlags,
  fieldScriptOf,
  isFieldScript,
  needsScriptRight,
  widgetActionsOf,
  writesScripts,
  WIDGET_ACTION_EVENTS,
} from './dto/PdfAction';

// Canonical PDF-document geometry vocabulary (y-up, edges, browser-free).
export type {
  PdfPoint,
  PdfRect,
  PdfSize,
  PdfQuad,
  PdfQuadPoints,
  PdfRotation,
  PdfOriginSize,
  PdfPointTurn,
  WrittenPageBoxes,
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
  normalizePdfQuad,
  pdfRectTurnedBounds,
  pdfRectIntersection,
  isSamePdfRect,
  pdfPointsBounds,
  pdfPointTurned,
  pdfPointUnturned,
  pdfTurnOfDrawn,
  pdfTurnOfUpright,
  renderSize,
  pageTransform,
  renderAreaTransform,
  renderMatrix,
  renderTargetArea,
  renderTransform,
  DEFAULT_MEDIA_BOX,
  pageBoxesOf,
  pageRotationOf,
} from './geometry';
export type { PageTextSnapshot } from './dto/PageTextSnapshot';
export type {
  PageGeometryGlyph,
  PageGeometryRun,
  PageGeometrySnapshot,
  RotatedGeometryGlyph,
  RotatedGeometryRun,
  UprightGeometryRun,
} from './dto/PageGeometrySnapshot';
export { glyphLooseBounds, glyphLooseQuad, isRotatedGeometryRun } from './dto/PageGeometrySnapshot';
export type {
  PageImageHandle,
  PageImageBlobSource,
  PageImageOptions,
  PageImageObjectUrl,
  PageImageResult,
  PageImageSource,
  PageNetworkRenderFormat,
  PageRaster,
  PageLayerRights,
  PageRenderBackground,
  PageRenderEncodedFormat,
  PageRenderFormat,
  PageRenderImage,
  PageRenderOptions,
  PageRenderRaster,
  PageRenderQuery,
  PageRenderTarget,
  PageRenderViewport,
} from './dto/PageRender';
export { checkImageQuality, createPageImageHandle, resolvePageLayers } from './dto/PageRender';
export {
  ANNOTATION_APPEARANCE_MODES,
  appearanceModesOf,
  shownAppearances,
} from './dto/AnnotationRender';
export type {
  AnnotationAppearanceMode,
  AnnotationAppearanceRenderOptions,
  AnnotationAppearanceImageOptions,
  AnnotationAppearancesQuery,
  WidgetAppearancesQuery,
  AnnotationAppearanceRaster,
  AnnotationAppearancesResult,
  AnnotationAppearanceImage,
  AnnotationAppearanceImagesResult,
  AnnotationAppearanceManifestEntry,
  AnnotationAppearanceManifest,
} from './dto/AnnotationRender';
export type { CachePins } from './dto/CachePins';
export { DEFAULT_PDF_SAVE_MODE } from './dto/PdfSaveMode';
export type { DownloadOptions, PdfSaveMode } from './dto/PdfSaveMode';
export type {
  FontEmbeddingPermission,
  FontHandle,
  FontIdentityInfo,
  FontKey,
  FontSpec,
} from './dto/FontSpec';
export type {
  RichTextAlign,
  RichTextBody,
  RichTextDecoration,
  RichTextDirection,
  RichTextDocument,
  RichTextDocumentInput,
  RichTextMargins,
  RichTextParagraph,
  RichTextParagraphProps,
  RichTextRun,
  RichTextRunStyle,
  RichTextScript,
} from './dto/RichText';
export {
  DEFAULT_RICH_TEXT_BODY,
  richTextPlainText,
  richTextParagraphsFromPlainText,
} from './dto/RichText';

export { EngineError, serializeError, deserializeError } from './errors/EngineError';
export type { SerializedEngineError, EngineErrorOptions } from './errors/EngineError';
export { EngineErrorCode } from './errors/EngineErrorCode';

export { isValidPageObjectNumber } from './identity/PageObjectNumber';
export type { PageObjectNumber } from './identity/PageObjectNumber';
export type { PageRef } from './identity/PageRef';
export { toPageRef, pageRefsEqual, encodePageKey, decodePageKey } from './identity/PageRef';
export { generateUuid, generateUuidV7 } from './identity/uuid';
export type { AnnotationRef } from './identity/AnnotationRef';
export {
  OBJECT_NUMBER_CEILING,
  OBJECT_NUMBER_ISSUE_LIMIT,
  formatObjectNumberRanges,
  objectNumbersIn,
  parseObjectNumberRanges,
} from './identity/ObjectNumbers';
export type {
  EditSessionAccess,
  EditSessionStatus,
  ObjectNumberPool,
  ObjectNumberRange,
  ObjectNumbersLost,
} from './identity/ObjectNumbers';
export { encodeAnnotKey, decodeAnnotKey } from './identity/AnnotationRef';

export { colorOf, rgbOf, sameColor } from './annotation/color';
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
  DrawnBorderStyle,
  StandardFont,
  FreeTextFont,
  TextAlignment,
  VerticalAlignment,
  FreeTextIntent,
  CaretIntent,
  StrikeoutIntent,
  InkIntent,
  BlendMode,
} from './annotation/primitives';
export { STANDARD_FONTS } from './annotation/primitives';
export { NO_ANNOTATION_FLAGS } from './annotation/primitives';
export { ANNOTATION_FIELD_NAMES, ANNOTATION_RESOURCE_ROLES } from './annotation/field-names';
export { ANNOTATION_FIELD_SPACES } from './annotation/field-spaces';
export type { MeasuredFieldSpace } from './annotation/field-spaces';
export type { FieldSpace } from './annotation/declaration';

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
export { familyOfSubtype } from './annotation/family';
export type { AnnotationFamily } from './annotation/family';

// Binary payloads — zod-free.
export type {
  BinarySource,
  BinaryPayload,
  WireResource,
  WireResourceMap,
} from './resource/BinarySource';
export { resolveBinarySource } from './resource/BinarySource';
export type { DateInput, IsoDateTime } from './dto/IsoDateTime';
export { compareIsoDateTime } from './dto/IsoDateTime';
export type { BinaryMetadata, BinaryMimeType } from './resource/binaryMetadata';
export { sniffBinaryMetadata } from './resource/binaryMetadata';
export type {
  AnnotationResources,
  AnnotationResourceRole,
  ResourceBytes,
  WireAnnotationResources,
} from './annotation/resources';
export {
  ANNOTATION_RESOURCE_ROLE_NAMES,
  annotationResourceBuffers,
  assertAnnotationResources,
  hasAnnotationResources,
  withFileFromResource,
  resolveAnnotationResources,
} from './annotation/resources';
export { normalizeAttachmentFileSource } from './dto/normalizeAttachmentFileSource';

// Annotation bundles: annotations and their resources, to move between
// documents in one call, and the JSON file that holds one.
export type {
  AnnotationBundle,
  AnnotationBundleItem,
  AnnotationBundlePage,
  ResourceId,
  WireAnnotationBundle,
} from './transfer/AnnotationBundle';
export type { AnnotationExportSelection } from './transfer/exportSelection';
export type {
  AnnotationDropReason,
  AnnotationImportDrop,
  AnnotationImportOptions,
  AnnotationImportManifest,
  AnnotationImportPages,
  AnnotationImportPlan,
  AnnotationImportResult,
  AnnotationImportTarget,
  PlannedAnnotation,
} from './transfer/annotationImport';
export { annotationImportFacts, planAnnotationImport } from './transfer/annotationImport';
export { closeExportSelection } from './transfer/exportSelection';
export { mapPageRefs, pageRefsIn } from './transfer/pageRefs';
export {
  assertAnnotationBundle,
  assertBundleManifest,
  resourceIdOf,
} from './transfer/AnnotationBundle';
export type { AnnotationBundleLimits } from './transfer/bundleLimits';
export {
  assertWithinLimit,
  DEFAULT_ANNOTATION_BUNDLE_LIMITS,
  manifestBytesOf,
} from './transfer/bundleLimits';
export type { AnnotationTransferOptions } from './transfer/AnnotationTransfer';
export { AnnotationTransfer } from './transfer/AnnotationTransfer';

// Attachment vocabulary — one set of file metadata fields shared by the
// file-attachment kind and the document-level attachments service.
export type {
  AttachmentFileBase,
  AttachmentFileSource,
  AttachmentFileInfo,
  Attachment,
  AttachmentList,
  AttachmentRef,
  AttachmentContent,
  WireAttachmentFile,
} from './dto/Attachment';
export { toAttachmentRef } from './dto/Attachment';
export type {
  AttachmentCreateResult,
  AttachmentDeleteResult,
  AttachmentMutationMeta,
} from './mutation/AttachmentMutationResults';
export { deletedAttachmentOf } from './mutation/AttachmentMutationResults';

export type {
  AnnotationKindModule,
  DTOOfKind,
  DraftOfKind,
  PatchOfKind,
} from './annotation/registry';
export type {
  AnnotationKind,
  AnnotationSubtypeOfKind,
  Annotation,
  AnnotationDraft,
  AnnotationPatch,
  HighlightAnnotation,
  HighlightDraft,
  HighlightPatch,
  UnderlineAnnotation,
  UnderlineDraft,
  UnderlinePatch,
  SquigglyAnnotation,
  SquigglyDraft,
  SquigglyPatch,
  StrikeoutAnnotation,
  StrikeoutDraft,
  StrikeoutPatch,
  CircleAnnotation,
  CircleDraft,
  CirclePatch,
  SquareAnnotation,
  SquareDraft,
  SquarePatch,
  PolygonAnnotation,
  PolygonDraft,
  PolygonPatch,
  PolylineAnnotation,
  PolylineDraft,
  PolylinePatch,
  LineAnnotation,
  LineDraft,
  LinePatch,
  LinkAnnotation,
  LinkDraft,
  LinkPatch,
  InkAnnotation,
  InkDraft,
  InkPatch,
  FreeTextAnnotation,
  FreeTextDraft,
  FreeTextPatch,
  CaretAnnotation,
  CaretDraft,
  CaretPatch,
  RedactAnnotation,
  RedactDraft,
  RedactPatch,
  TextAnnotation,
  TextDraft,
  TextPatch,
  NoteIcon,
  StampAnnotation,
  StampDraft,
  StampPatch,
  StampFit,
  FileAttachmentAnnotation,
  FileAttachmentDraft,
  FileAttachmentPatch,
  FileAttachmentIcon,
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
  UnsupportedAnnotation,
  UnsupportedDraft,
  UnsupportedPatch,
  WidgetAnnotation,
  WidgetDraft,
  WidgetPatch,
  PopupAnnotation,
  PopupDraft,
  PopupPatch,
  AnnotationDeclaration,
  CreateOf,
  ReadOf,
  UpdateOf,
} from './annotation/kinds';

export { concatAnnotationLists } from './annotation/AnnotationList';
export type { AnnotationList, AnnotationListOptions } from './annotation/AnnotationList';

export { classifyRelation, buildThreads, deletedWith } from './annotation/relationships';
export { annotationKey } from './identity/annotationKey';
export type { AnnotationRelationKind, AnnotationThread } from './annotation/relationships';

export {
  buildCommentThreads,
  isStateAnnotation,
  standardStateModelOf,
} from './annotation/comments';
export type {
  BuildCommentThreadsOptions,
  CommentThread,
  CommentThreadReview,
  ReviewStatus,
} from './annotation/comments';

export type { DocumentManifest, ManifestPage } from './dto/DocumentManifest';
export type { LayerScopes, LayerScopePlane } from './dto/LayerScopes';
export type { PageDestination, PdfDestination } from './dto/PdfDestination';
export type {
  PdfLinkTarget,
  PdfLinkTargetWritable,
  PdfStandardNamedAction,
} from './dto/PdfLinkTarget';
export type { CacheDelta, MutationMeta } from './mutation/MutationMeta';
export type { AnnotationListMutationMeta } from './mutation/AnnotationListMutationMeta';
export type {
  AnnotationCreateResult,
  AnnotationUpdateResult,
  AnnotationDeleteResult,
  AnnotationReorderResult,
} from './mutation/AnnotationMutationResults';
export { deletedAnnotationsOf } from './mutation/AnnotationMutationResults';
export type {
  AppearanceAction,
  AppearanceChange,
  AppearanceImpact,
  AppearanceOutcome,
} from './annotation/appearance';
export {
  appearanceChangeOf,
  appearanceImpactOf,
  semanticEqual,
  UNBAKED_KINDS,
} from './annotation/appearance';
export { pdfAppearanceTurnOf } from './annotation/appearanceTurn';
export { assertAnnotationDraft } from './annotation/checkWrite';
export { DRAWN_RECT_KINDS } from './annotation/shapeForRect';
export {
  annotationPatchBetween,
  assertDeclaredFields,
  assertRichTextAgreement,
  mergeAnnotationPatch,
  pdfResolveAnnotationDraft,
  pdfResolveAnnotationPatch,
  resolveMeasurementDraft,
  touchesCaption,
  type DraftResolveOptions,
  type ResolveOptions,
} from './annotation/resolve';
export {
  ANNOTATION_DEFAULTS,
  annotationDefaultsOf,
  type AnnotationDefaults,
} from './annotation/defaults';
export {
  faceForFreeTextFont,
  isStandardFontName,
  STANDARD_FACES,
  type DescribeFont,
  type FaceRequest,
} from './annotation/fontFaces';

// Page space: positions from the top-left of a page's visible box, y down.
export type { PageBox, PagePoint, PageQuad } from './geometry';
export type {
  PageRenderMatrix,
  PageRenderTransform,
  PageTransformOptions,
  PixelBox,
  PixelPoint,
  PixelQuad,
} from './geometry';
export { pageBoxOf, pagePointOf, pageQuadOf, pdfPointOf, pdfQuadOf, pdfRectOf } from './geometry';
export * from './pageSpace';
export type { FormFieldRef, FormWidget } from './identity/FormFieldRef';
export { formWidget, toFieldRef } from './identity/FormFieldRef';
export { encodeFieldRefKey, decodeFieldRefKey } from './identity/FormFieldRef';
export type {
  FormFieldFamily,
  FormFieldOrigin,
  ToggleFieldWidget,
  FormFieldWidget,
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
  WidgetAppearance,
} from './annotation/kinds/widget.shared';
export type { FormKind, FormSnapshot } from './forms/snapshot';
export type {
  WidgetPlacement,
  FormFieldOptionInput,
  TextFieldDraft,
  CheckboxFieldDraft,
  RadioFieldDraft,
  ComboBoxFieldDraft,
  ListBoxFieldDraft,
  PushButtonFieldDraft,
  SignatureFieldDraft,
  FormFieldDraft,
} from './forms/draft';
export { draftWritesScripts } from './forms/draft';
export type {
  TextFieldPatch,
  CheckboxFieldPatch,
  RadioFieldPatch,
  ComboBoxFieldPatch,
  ListBoxFieldPatch,
  PushButtonFieldPatch,
  SignatureFieldPatch,
  FormFieldPatch,
} from './forms/patch';
export type { FormFieldValue, FormDataFormat } from './forms/value';
export type {
  FormSubmissionEntry,
  FormSubmissionRequest,
  FormSubmissionReceipt,
} from './forms/submission';
export type {
  FormFieldDisplay,
  FormEffect,
  FormEffectStatus,
  FormEffectResult,
  FormEffectsResult,
} from './forms/effects';
export type {
  BaseVersionInfo,
  DigestAlgorithm,
  DocMdpPermission,
  DocumentFieldLock,
  DocumentProtection,
  DocumentVersionRef,
  FieldLockAction,
  FieldLockSpec,
  ModificationLevel,
  PdfRevision,
  SignatureCancelResult,
  SignatureSignerInput,
  SignatureAppearanceInput,
  SignatureCompleteInput,
  SignatureCompleteResult,
  SignatureCoverage,
  SignatureDTO,
  SignatureKind,
  SignaturePrepareInput,
  SignaturePrepared,
  SignatureSeedValue,
  SignatureSigner,
  SignatureSnapshot,
  SignatureSubFilter,
  SignedDocumentPolicy,
} from './signature/types';
export type {
  AnalyzeInput,
  ChangeAnalysis,
  ChangeFinding,
  Assessment,
  ObjectChange,
  ObjectReadStatus,
  RestrictionAnchor,
  RevisionHealth,
  ObjectChangeKind,
  ObjectChangeType,
  ObjectReferrer,
  PdfValue,
  RevisionAnalysis,
  RevisionField,
  RevisionStructure,
  StepInput,
  StepVerdict,
} from './signature/analysis/types';
export {
  changedKeys,
  dictEntries,
  evaluateStep,
  restrictionsFor,
  sameEffectiveValue,
  conclude,
  combine,
  assessmentOf,
  primaryFinding,
  parsePdfValue,
  pdfValueEquals,
  refsOf,
  restrictionsOf,
  stableStringify,
  worstVerdict,
  EdgeResolver,
  DEFAULT_EDGE_RESOLVER_BUDGET,
  USAGE_INCOMPLETE,
} from './signature/analysis';
export type { EdgeResolverBudget, ResolvedUsage } from './signature/analysis';
export {
  PROTECTABLE_CAPABILITIES,
  SIGNATURE_POLICY_VERSION,
  deriveProtection,
  describeProtection,
  fieldLockFor,
  isProtectableCapability,
  levelAllows,
  levelFromPermission,
  lockCovers,
  lockNameCovers,
  minLevel,
  protectedCapabilities,
} from './signature/protection';
export type { ProtectableCapability } from './signature/protection';
export { deletedFieldOf, formResetFacts } from './mutation/FormMutationResults';
export type {
  FormMutationMeta,
  FormSetValueResult,
  FormResetResult,
  FormImportResult,
  FormDataExport,
  FormRepairResult,
  FormFieldCreateResult,
  FormFieldUpdateResult,
  FormFieldDeleteResult,
  FormWidgetDeleteResult,
  FormWidgetLinkResult,
  FormWidgetRestoreResult,
  FormWidgetRows,
  FormWidgetsReorderResult,
  FormCalculationsReorderResult,
  FormWidgetUpdateResult,
} from './mutation/FormMutationResults';
// Search: contract types + the pure match/anchor stages. The matcher and
// line-merge are exported (not just types) because the local worker, the
// server, and the conformance suite all run the same code — parity between
// engines is a design invariant, not a test hope.
export { searchQueryOf } from './search/types';
export type {
  SearchQuery,
  SearchLimit,
  SearchRequest,
  SearchSnippet,
  SearchMatch,
  SearchSlice,
} from './search/types';
export { SEARCH_FOLD_VERSION, foldText, toOriginalRange } from './search/fold';
export type { FoldOptions, FoldedText } from './search/fold';
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
export { createPdfTextLayout } from './text/layout';
export type { PdfTextSegment, TextLayout } from './text/layout';
export type { PageTextRange, TextRange } from './text/TextRange';
export {
  boundaryTextOffset,
  charBoundaryAtTextOffset,
  charMapViolation,
  charRangeForTextOffsets,
  sliceText,
} from './text/charmap';
export type { CharBoundaryBias, CharMapAnchor } from './text/charmap';
export { searchContentEpoch, canonicalSearchQuery } from './search/epoch';

export type { PageReorderInput } from './mutation/PageReorderInput';
export type { PageReorderResult } from './mutation/PageReorderResult';
export { anchorOf, positionIndex, reorderPart, reorderedList } from './mutation/ListPosition';
export type {
  AnnotationPosition,
  FieldPosition,
  ListPosition,
  PagePosition,
} from './mutation/ListPosition';
export type { PageNameInput, PageRemoveNameInput } from './mutation/PageNameInput';
export type { PageNameResult } from './mutation/PageNameResult';
export type {
  AnnotationFlattenInput,
  AnnotationFlattenItemResult,
  AnnotationFlattenResult,
  AnnotationAppearanceExportInput,
} from './mutation/AnnotationFlattenResult';
export type { PageRotateInput } from './mutation/PageRotateInput';
export type { PageRotateResult } from './mutation/PageRotateResult';
export type { PageDeleteInput } from './mutation/PageDeleteInput';
export type { PageDeleteResult } from './mutation/PageDeleteResult';
export type { PageInsertResult } from './mutation/PageInsertResult';
export type { PageInsertBlankSpec } from './mutation/PageInsertBlankInput';
export { opIdOf } from './mutation/WriteOptions';
export {
  isSkippedItem,
  isUndoChange,
  objectNumbersNamedBy,
  resolveChangeResources,
} from './mutation/Change';
export { changeFingerprint, isKeptRefusal } from './mutation/changeOutcome';
export type {
  Change,
  ChangeAnswer,
  ChangeOp,
  ChangeItem,
  ChangeResult,
  ChangeItemType,
  SkippedChangeItem,
} from './mutation/Change';
export type {
  WriteOptions,
  AnnotationCreateOptions,
  AnnotationUpdateOptions,
  FlattenWriteOptions,
  PageInsertBlankOptions,
  FormFieldCreateOptions,
  FormWidgetAddOptions,
} from './mutation/WriteOptions';
export { PAGE_INSERT_BLANK_MAX_COUNT } from './mutation/PageInsertBlankInput';
export type {
  FlattenOptions,
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
export type { MetadataUpdateResult } from './mutation/MetadataUpdateResult';
export type { CustomMetadataUpdateResult } from './mutation/CustomMetadataUpdateResult';

export type {
  AnnotationActor,
  CollabAction,
  CollabEntity,
  CollabFilter,
  DocCapability,
  Identity,
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
export type { AnnotationAuthority, ChangeAuthority } from './auth/scope';
export {
  annotationWriteCapabilities,
  annotationWriteCapability,
  authorizeAnnotationCreate,
  authorizeCapability,
  authorizeUnprotected,
  authorizeAnnotationDelete,
  authorizeAnnotationUpdate,
} from './auth/scope';
export type { CollabTarget } from './auth/scope';
export { collabTargetOf } from './auth/scope';
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

// Note: CDN-shaped surface (DOC_RESOURCES, cdnCoverageForScope, applyCdnAccess,
// CdnCoverageEntry, etc.) is deliberately not re-exported here. It lives under
// `@embedpdf/engine-core/wire` only, because it is HTTP-wire territory: server
// route guards and the cloud SDK consume it, and engine-local must not pull it
// into its bundle.

export * from './dto/Measure';
export * from './measure';

export type { PageScaleResult } from './mutation/PageScaleResult';
