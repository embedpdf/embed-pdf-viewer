/**
 * @embedpdf-x/annotation-core — the pure annotation brain.
 *
 * model · update(msg)→[model,effects] · view (pageItems + chrome). Per-kind
 * content-space geometry (rect/ellipse · line · poly · quads), stroke+fill
 * hit-testing, cursors, the select + create tools. No DOM, no engine, no
 * framework — the part that ports to Rust/Crux.
 */
export {
  update,
  initialModel,
  initialStyle,
  defaultsFor,
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
export { groupKeyOf, groupMembers, expandGroups, groupCaps, type GroupCaps } from './group';
export {
  KINDS,
  capsFor,
  propsFor,
  type KindCaps,
  type AnnotationKind,
  type PropSpec,
} from './kinds';
export {
  applyProps,
  initialTextStyle,
  readProp,
  sharedProps,
  styleFromProps,
  textStyleFromProps,
} from './props';
export {
  geomScene,
  geomBounds,
  geomVisualBounds,
  geomHit,
  geomHandles,
  geomTranslate,
  geomDragHandle,
  geomPdfBounds,
  calloutConnection,
  calloutLinePoints,
  pdfToContentRect,
  contentToPdfRect,
  pdfToContentPoint,
  contentToPdfPoint,
  rectFromPoints,
  caretRectFromTextEnd,
  selectionBounds,
  selectionQuad,
  selectionCenter,
  pointInQuad,
  quadIntersectsRect,
  shapeRectFor,
  unionRect,
  RECT_HANDLES,
  rotatedHandleCursor,
  type RectHandle,
  // rotation
  centroidOf,
  geomRotation,
  geomRotateAbout,
  geomResetRotation,
  obbFromGeom,
  rotateKnob,
  placeRotateKnob,
  rotatedAabb,
  DEFAULT_CHROME_GEOM,
  normalizeDeg,
  isRotatableGeom,
  // upright placement
  uprightRotation,
  transposedAboutCenter,
  uprightAnchoredRect,
  fitStampBox,
  ROTATE_KNOB_OFFSET,
  MITER_LIMIT,
  // group scaling
  geomScaleAbout,
  groupResizeAnchor,
  groupResizeBox,
  groupResizeFactors,
} from './geometry';
export { cloudyPath, cloudyBorderExtent } from './cloudy';
export { scene } from './scene';
export { straightenInkStroke } from './ink';
export type { BlendMode } from '@embedpdf/engine-core/runtime';
export type {
  Annot,
  AnnotationProps,
  AnnotationPropsPatch,
  Border,
  Callout,
  ChromeGeom,
  ChromeNode,
  Cursor,
  CreationDraftAnchor,
  Draft,
  Effect,
  Geom,
  Guide,
  Handle,
  Id,
  InkStraightenOptions,
  Model,
  Msg,
  ClickCreate,
  PointerInput,
  PropKey,
  Quad,
  Rect,
  LineEnding,
  LineEndings,
  Paint,
  RenderItem,
  RenderNode,
  SceneNode,
  SnapSettings,
  Style,
  Subtype,
  TextAlign,
  TextStyle,
  Vec,
} from './types';
