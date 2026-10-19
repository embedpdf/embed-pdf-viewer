/**
 * @embedpdf/vue/annotation: the Vue view of `@embedpdf/plugin-annotation`.
 *
 * `<AnnotationLayer>` draws a page's annotations, the selection's handles,
 * the tool's preview and the text boxes being typed in, with `renderers` for
 * your own looks and `#handle` / `#rotation-handle` slots for your own
 * handles. `<AnnotationMenu>`, `<AnnotationDraftMenu>` and
 * `<AnnotationRotationBadge>` float your UI over the selection, a shape being
 * drawn and a turn in progress.
 *
 * The composables follow every plugin's four: `useAnnotation()` (the API),
 * `useAnnotationState()` (status, selected, hovered, editing),
 * `useAnnotationEvent()` and `useAnnotationSettings()`; the reads a component
 * follows on their own are refs: `useAnnotationList()`,
 * `useAnnotationDefaults()`, `useAnnotationProperties()`,
 * `useAnnotationAnchor()`, and the comments' `useCommentThreads()` and
 * `useCommentThread()`. `useRichTextEditor()` makes your element a text box's
 * editor, and `useFilePickerProvider()` installs the file dialog behind
 * click-then-pick tools.
 *
 * What isn't Vue lives in `@embedpdf/web`, the same for every framework: the
 * scene as SVG elements, the chrome's paint and pixels, the text box editor,
 * which drawing each annotation gets and the behaviors renderers register,
 * and the object URLs of baked appearances and the stamp ghost.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-annotation';
export type {
  CreationDraftAnchor,
  RenderItem,
  LineEnding,
  LineEndings,
  Style,
  AnnotationFlags,
  FieldValues,
  TextAlign,
  TextStyle,
} from '@embedpdf/core-annotation';

export { default as AnnotationLayer } from './annotation/AnnotationLayer.vue';
export { default as AnnotationMenu } from './annotation/AnnotationMenu.vue';
export { default as AnnotationDraftMenu } from './annotation/AnnotationDraftMenu.vue';
export { default as AnnotationRotationBadge } from './annotation/AnnotationRotationBadge.vue';

export { useAnnotationSettings, useAnnotationState } from './annotation/state';
export {
  filePickerProvider,
  useAnnotation,
  useAnnotationAnchor,
  useAnnotationDefaults,
  useAnnotationEvent,
  useAnnotationList,
  useAnnotationProperties,
  useCommentThread,
  useCommentThreads,
  useComments,
  useFilePickerProvider,
} from './annotation/composables';
export { useRichTextEditor } from './annotation/text-box';
export type {
  AnnotationFrame,
  AnnotationInteractiveContext,
  AnnotationRenderer,
  AnnotationRendererProps,
  BehaviorRendererProps,
  CommentThreadView,
  HandleProps,
  RichTextEditor,
  RotationHandleProps,
} from './annotation/types';
