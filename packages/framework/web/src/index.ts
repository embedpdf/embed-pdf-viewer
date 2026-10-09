/**
 * @embedpdf/web — framework-free browser adapters.
 *
 * The single home for EmbedPDF code that touches `window`/`document`. The
 * plugin and *-core packages compile with `lib: ['ES2020']` (no DOM), so the
 * boundary is enforced by the type system, not convention: DOM simply does not
 * exist in their type universe. Anything environmental — file dialogs, clipboard,
 * print — lives here and is consumed by the framework adapters (react, vue, …).
 * So does everything those adapters would otherwise each write: the page
 * layers' geometry and paint, the editing controllers and their policies, so
 * an adapter keeps only its bindings and markup.
 */
export {
  installFilePickerProvider,
  pickImageFile,
  pickFile,
  pickRequestedFile,
  saveFile,
} from './file-picker';
export type { FilePickerPort, PickFileOptions } from './file-picker';
export { browserClock } from './clock';
export type { WebClock } from './clock';
export { cssText } from './css-text';
export type { StyleRecord } from './css-text';
export { copySelection, wireSelectionClipboard } from './clipboard';
export type { ClipboardSelectionSource, SelectionClipboardOptions } from './clipboard';
export { bindCommandShortcuts, isMacPlatform } from './command-shortcuts';
export type { CommandShortcutOptions, ShortcutCommands } from './command-shortcuts';
export {
  anchoredViewOf,
  fitAnchoredRect,
  observeAnchoredFit,
  observeClientGeometry,
  positionAnchoredRect,
  projectAnchoredTarget,
  sameAnchoredFit,
} from './anchored-position';
export type {
  AnchorTarget,
  AnchoredFit,
  AnchoredOptions,
  AnchoredPlacement,
  AnchoredPoint,
  AnchoredPosition,
  AnchoredRect,
  AnchoredSide,
  AnchoredSize,
  PageViewEnv,
  ViewProjector,
} from './anchored-position';
export { frameInPixels, lookFrameOf, rasterInFrame } from './annotation-frame';
export type {
  AnnotationLookFrame,
  FrameBox,
  FrameFraction,
  FramePixels,
  PageLayerTransform,
  PixelBox,
  TurnedBox,
} from './annotation-frame';
export type { PageRef } from './page-ref';
export { svgCursor, toolCursorsOf } from './cursor';
export type { SvgCursorOptions, ToolCursorImage, ToolCursorSpec } from './cursor';
export { openExternalUri, sanitizeExternalUri } from './external-uri';
export { createDefaultActionsUiAdapter } from './actions-ui';
export type {
  ActionsUiAdapterShape,
  ActionsUiEffectContext,
  ActionsUiOrigin,
  DefaultActionsUiAdapterOptions,
} from './actions-ui';
export { bindPaintedImage } from './painted-image';
export type { ObjectUrlImageSource, PaintedImageCallbacks } from './painted-image';
export { vibrationFeedback, wkFeedback } from './feedback';
export type { WebPlatformFeedback } from './feedback';
export { computeReleaseVelocity, createStageGestureController } from './stage-gestures';
export type {
  StageGestureHost,
  StageGestureOptions,
  StageGestureSink,
  StagePointerKind,
  StageWheelSample,
} from './stage-gestures';
export { attachSelectionHandle } from './selection-handles';
export type { AttachSelectionHandleOptions, SelectionHandleSession } from './selection-handles';
export { createStageSurface } from './stage-surface';
export type {
  StageSurfaceHost,
  StageSurfaceHub,
  StageSurfaceOptions,
  StageSurfaceSample,
} from './stage-surface';
export { wheelZoomFactor } from './wheel';
export type { WheelSample } from './wheel';
export { indexedDbByteStore } from './byte-store';
export type { ByteStore, IndexedDbByteStoreOptions } from './byte-store';
export {
  applyFirstLineShift,
  attachRichTextEditor,
  offsetOfPosition,
  positionOfOffset,
  renderRichText,
  serializeRichText,
  styleDeltaOf,
} from './rich-text-editor';
export type {
  EditorDocumentFactory,
  EditorElement,
  EditorNode,
  EditorPosition,
  EditorRoot,
  EditorStyle,
  RichTextEditorAlign,
  RichTextEditorBinding,
  RichTextEditorCommand,
  RichTextEditorDecoration,
  RichTextEditorDocument,
  RichTextEditorHost,
  RichTextEditorParagraph,
  RichTextEditorProps,
  RichTextEditorRange,
  RichTextEditorRun,
  RichTextEditorScript,
  RichTextEditorStyle,
} from './rich-text-editor';
export { mountWebFont } from './web-font';
export { firstLineShiftFor, lineModelFor, webFontMetrics } from './web-font-metrics';
export type { LineModel, WebFontMetrics } from './web-font-metrics';
export { EPDF_VARIABLES, epdfThemeVariables, mixAccent, paint, paintDefault } from './theme';
export type {
  EpdfCssOnlyVariable,
  EpdfTheme,
  EpdfThemeVariables,
  EpdfFollowedVariable,
  EpdfSettingVariable,
  EpdfTranslucentVariable,
  EpdfVariable,
  EpdfVariableDefinition,
} from './theme';
export { isUprightQuad, quadInPixels, rectInPixels, svgPoints } from './page-pixels';
export type { PagePoint, PageQuad, PageToPixels, PixelRect } from './page-pixels';
export { isolatePointerDown, isolateWheel } from './event-isolation';
export {
  samePageBounds,
  sameAnnotationAnchor,
  sameCreationDraftAnchor,
  sameRotationAnchor,
  sameSelectionAnchor,
  sameSelectionEndpoints,
} from './anchor-equality';
export type {
  AnnotationAnchorShape,
  CreationDraftAnchorShape,
  PageBoundsAnchor,
  RotationAnchorShape,
  SelectionAnchorShape,
  SelectionEndpointShape,
  SelectionEndpointsShape,
} from './anchor-equality';
export { ghostOpacity, sceneViewBox, svgShapesOf } from './annotation-scene';
export type {
  ScenePaint,
  SceneShapeNode,
  SvgShape,
  SvgShapeTag,
  SvgShapesOptions,
} from './annotation-scene';
export { annotationChromePaint, chromeInPixels } from './annotation-chrome';
export type {
  AnnotationChromePaint,
  ChromeInPixels,
  ChromeLine,
  ChromeLinePaint,
  ChromeNodeShape,
  ChromePaintSettings,
  ChromeShapePaint,
} from './annotation-chrome';
export {
  attachTextBoxEditor,
  createTextBoxEditorFollower,
  textBoxEditorScaleOf,
  textBoxStyleOf,
  textPlateInPixels,
} from './text-box-editor';
export type {
  TextBoxCss,
  TextBoxEditor,
  TextBoxEditorAnnotation,
  TextBoxEditorFollower,
  TextBoxEditorItem,
  TextBoxStyle,
  TextPlatePixels,
} from './text-box-editor';
export {
  annotationDrawingOf,
  editingTextKeyOf,
  layerTextBoxesOf,
  lookRendererFor,
  registerRendererBehaviors,
  rendererBehaviorId,
} from './annotation-renderers';
export type {
  AnnotationDrawing,
  BehaviorRendererEntry,
  LookRendererEntry,
  RendererBehaviorRegistry,
  RendererEntry,
  RendererInteractiveContext,
} from './annotation-renderers';
export {
  bakedAppearanceOf,
  createShownUrls,
  loadAppearanceUrls,
  loadFieldPictureUrls,
  loadObjectUrl,
  objectUrlOf,
  shownFieldPicture,
} from './object-urls';
export type {
  AppearancePicture,
  AppearanceUrl,
  FieldPicture,
  ObjectUrl,
  PictureBytes,
  ShownUrls,
} from './object-urls';
export { enrichCommentThreads } from './comment-threads';
export type { CommentPageLayout, CommentThreadPage } from './comment-threads';
export {
  bindWidgetEvents,
  createOptimisticSelection,
  createTextFieldEditor,
  cssFontOf,
  formColorsOf,
  listBoxStyleOf,
  pressToggle,
  showSelectedOptions,
  textFieldStyleOf,
} from './form-field';
export type {
  CssFont,
  FieldLook,
  FieldTextStyle,
  FormColorSettings,
  FormColors,
  ListBoxStyle,
  OptimisticSelection,
  SelectOptions,
  TextFieldDrafts,
  TextFieldEditor,
  TextFieldEditorState,
  TextFieldStyle,
  ToggleForm,
  WidgetEventKind,
} from './form-field';
export {
  FORM_CONTROL_FILL,
  formFocusRingStyleOf,
  listBoxControlStyleOf,
  textFieldEditorStyleOf,
  widgetBoxStyleOf,
} from './form-styles';
export type {
  FormControlFill,
  FormFocusRingStyle,
  ListBoxControlStyle,
  TextFieldEditorStyle,
  WidgetBoxStyle,
} from './form-styles';
export { isModifiedClick, linkAnchorOf, linkHrefOf, navigableLinksOf } from './link-anchor';
export type { LinkAnchor, LinkAnchorShape } from './link-anchor';
export { hoverLink, linkActivateContextOf, sendLinkEvent } from './link-events';
export type {
  LinkActionDispatcher,
  LinkActionSource,
  LinkAnchorEvent,
  LinkEventShape,
  LinkHoverPump,
} from './link-events';
export { searchHighlightsOf } from './search-highlights';
export type {
  SearchHighlightOptions,
  SearchHighlightPiece,
  SearchHitShape,
} from './search-highlights';
export { createClickDetector } from './press-click';
export type { ClickDetector } from './press-click';
export { clientPageProjector, stageViewProjector } from './page-projector';
export type { ClientProjectedPage, ProjectedTransform, StageProjection } from './page-projector';
export { livePageContext, makePageContext, pageClientSpace } from './page-context';
export type {
  ClientBox,
  PageClientSpace,
  PageContext,
  PageContextTransform,
  PageFrameShape,
} from './page-context';
export { pageLayersOf, partsDrawnTwice, pictureLayerOptionsOf } from './page-layers';
export type {
  PageLayers,
  PagePart,
  PaintedParts,
  PartRights,
  PictureLayerOptions,
  PicturePartProps,
} from './page-layers';
export { pageSurfaceLayout, pageViewTransformInput, stagePageDemand } from './page-surface';
export type {
  PageSurfaceLayout,
  PageViewPage,
  PageViewTransformInput,
  StageDemandSource,
  StagePageDemand,
  SurfaceBox,
  SurfaceTransform,
} from './page-surface';
export { attachPagePointer, createClickCounter } from './page-pointer';
export type { PagePointerHub, PagePointerPage, PagePointerSample } from './page-pointer';
export { createScrollbarPresses, scrollbarLayout } from './scrollbar';
export type {
  ScrollbarLayout,
  ScrollbarMetrics,
  ScrollbarPointerEvent,
  ScrollbarPresses,
  ScrollbarStage,
  ScrollbarTrack,
} from './scrollbar';
export {
  createToolbarWidths,
  observeContentWidth,
  observeWidth,
  toolbarMeasureKey,
} from './toolbar-measure';
export type { ToolbarFitMetrics, ToolbarWidths } from './toolbar-measure';
export { standardCommandsBrowser } from './standard-commands-platform';
export type { StandardCommandsBrowser } from './standard-commands-platform';
