/**
 * @embedpdf/core-annotation — the pure annotation brain.
 *
 * `update(model, message)` → { session, change, effects } · view (pageItems +
 * chrome). Per-kind page-space geometry (rect/ellipse · line · poly ·
 * quads), stroke+fill hit-testing, cursors, the select + create tools. No DOM,
 * no engine, no framework — the part that ports to Rust/Crux. See README.md.
 */
export {
  update,
  initialModel,
  initialSession,
  sameSession,
  EMPTY_CHANGE,
  defaultsFor,
  lineEndingsOf,
  toolAnnotation,
  rotateDraftDelta,
  MIN_DRAG,
} from './update';
export {
  clampRectToBox,
  clickCreateGeom,
  resolveClickPlacement,
  type ClickPlacement,
} from './placement';
export { computeMoveSnap, type SnapResult } from './snap';
export {
  pageItems,
  chrome,
  selectedItems,
  textBoxes,
  selectionBoundsOnPage,
  selectionAnchor,
  selectionKnob,
  creationDraftAnchor,
} from './view';
export type { TextBox } from './view';
export { hitTest, cursorAt, isSelectable, canMove, type Target } from './hit';
// Rich text run algebra (pure): what the editor binding and the plugin's
// selection styling compute with.
export {
  applyStyleToRange,
  bodyFromTextStyle,
  faceForFont,
  isPlainRichText,
  locateOffset,
  normalizeRuns,
  paragraphsFromPlainText,
  plainTextOf,
  rangeHasStyle,
  richDocOf,
  richTextLength,
  sameStyleDelta,
  splitRunsAt,
  styleAt,
  type FontLookup,
  type RichTextRange,
  type RichTextStyleDelta,
} from './richtext';
export { groupKeyOf, groupMembers, expandGroups, groupCaps, type GroupCaps } from './group';
export { isAttachedLink, isConversationOnly, isSubstrateOnly } from './plane';
export { linkChildrenOf, linkOf } from './links';
// `/F` annotation flags: the predicates are the one spec interpretation.
export {
  DRAWN_FLAGS,
  FLAG_KEYS,
  NO_ANNOTATION_FLAGS,
  annotContentsEditable,
  annotInteractive,
  annotDeletable,
  annotTransformable,
  flagsEqual,
  interactive,
  mergeFlags,
  viewable,
  type AnnotationFlags,
  type FlagBearer,
} from './flags';
// Screen-anchored (`noZoom`/`noRotate`) bodies: display-transform exemptions.
// One projection (`anchoredGeom`) + its exact inverse (`unanchoredGeom`),
// shared by render / hit / chrome / gestures.
export {
  anchorModeOf,
  anchorOf,
  anchoredBox,
  anchoredGeom,
  anchoredStrokeWidth,
  unanchoredGeom,
  type AnchorMode,
  type ViewEnv,
} from './anchor';
// The kinds: one declaration per kind (kinds/), by name.
export {
  defineKind,
  KINDS,
  kindNamed,
  NO_CAPS,
  type AnnotationKind,
  type FieldSpec,
  type KindCaps,
} from './kinds';
export { initialTextStyle, kindTakesLink, sharedFields } from './props';
export { engineSubtypeOf, readOfDefaults, widgetAppearanceOf } from './record/defaults';
export {
  geomScene,
  geomBounds,
  geomVisualBounds,
  geomHit,
  geomHandles,
  geomTranslate,
  geomDragHandle,
  selectionBounds,
  selectionQuad,
  turnPivotOf,
  pointInQuad,
  quadIntersectsRect,
  // rotation
  geomRotation,
  geomRotateAbout,
  geomResetRotation,
  obbFromGeom,
  rotateKnob,
  placeRotateKnob,
  DEFAULT_CHROME_GEOMETRY,
  isRotatableGeom,
  // upright placement
  uprightRotation,
  transposedAboutCenter,
  uprightAnchoredRect,
  fitStampBox,
  ROTATE_KNOB_OFFSET,
  // group scaling
  geomScaleAbout,
  groupResizeAnchor,
  groupResizeBox,
  groupResizeFactors,
} from './geometry';
export {
  rectFromPoints,
  unionRect,
  RECT_HANDLES,
  rotatedHandleCursor,
  rotatedAabb,
  normalizeDeg,
  type RectHandle,
} from './rect';
// The shape families: everything the core does with one kind of shape.
export {
  boxFamily,
  caretFamily,
  familyChosenBy,
  familyOf,
  pointsFamily,
  quadsFamily,
  textBoxFamily,
  type Corners,
  type ShapeFamily,
} from './shapes';
export type { BoxShape, TurnedBox } from './shapes/box';
export { caretFromAnchor, caretRectFromAnchor, type CaretShape } from './shapes/caret';
export type { QuadsShape } from './shapes/quads';
export {
  MITER_LIMIT,
  drawnStrokesOf,
  type InkShape,
  type LineShape,
  type PointsShape,
  type PolyShape,
} from './shapes/points';
export { calloutEnd, textPlateInset, type CalloutLine, type TextBoxShape } from './shapes/text-box';
// A record: the engine annotation it holds, read (who it is, its shape, how
// it is drawn, how its text is set) and written back as engine fields.
export {
  fromDTO,
  groupOf,
  irtOf,
  kindOf,
  linkChildRects,
  refOf,
  shapeOf,
  styleOf,
  textOf,
  withShape,
  withValues,
  writableTarget,
} from './record';
export { cloudyPath, cloudyBorderExtent } from './cloudy';
export * from './measurement';
export * from './measurement-shape';
// How an annotation is drawn: the engine's raster, or live (see appearance.ts).
export { drawnAfter, sourceOfNew, type DrawState } from './appearance';
export { annotationSelectionFrame, type SelectionFrame } from './selection';
export { scene } from './scene';
export { straightenInkStroke } from './ink';
export type { BlendMode } from '@embedpdf/engine-core/runtime';
export type {
  AnnotationView,
  ChangeSet,
  ModelAnnotation,
  ChromeGeometry,
  ChromeNode,
  Cursor,
  CreationDraftAnchor,
  Draft,
  Effect,
  Shape,
  Guide,
  Handle,
  Id,
  InkStraightenOptions,
  Model,
  Message,
  ClickCreate,
  PointerInput,
  FieldValues,
  QuadRing,
  Rect,
  LineEnding,
  LineEndings,
  Paint,
  Session,
  UpdateResult,
  RenderItem,
  RenderNode,
  SceneNode,
  SnapSettings,
  Stroke,
  Style,
  KindName,
  TextAlign,
  TextEndAnchor,
  Quad,
  TextStyle,
  Point,
} from './types';
