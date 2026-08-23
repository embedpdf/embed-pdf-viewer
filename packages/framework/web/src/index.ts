/**
 * @embedpdf/web — framework-free browser adapters.
 *
 * The single home for EmbedPDF v3 code that touches `window`/`document`. The
 * plugin and *-core packages compile with `lib: ['ES2020']` (no DOM), so the
 * boundary is enforced by the type system, not convention: DOM simply does not
 * exist in their type universe. Anything environmental — file dialogs, clipboard,
 * print — lives here and is consumed by the framework adapters (react, vue, …).
 */
export { pickImageFile, pickFile, saveFile } from './file-picker';
export type { PickFileOptions } from './file-picker';
export { copySelection, wireSelectionClipboard } from './clipboard';
export type { ClipboardSelectionSource, SelectionClipboardOptions } from './clipboard';
export {
  observeClientGeometry,
  positionAnchoredRect,
  projectAnchoredTarget,
} from './anchored-position';
export type {
  AnchorTarget,
  AnchoredPlacement,
  AnchoredPoint,
  AnchoredPosition,
  AnchoredRect,
  ViewProjector,
} from './anchored-position';
export { svgCursor } from './cursor';
export type { SvgCursorOptions } from './cursor';
export { sanitizeExternalUri } from './external-uri';
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
export { createStageSurface } from './stage-surface';
export type {
  StageSurfaceHost,
  StageSurfaceHub,
  StageSurfaceOptions,
  StageSurfaceSample,
} from './stage-surface';
export { wheelZoomFactor } from './wheel';
export type { WheelSample } from './wheel';
