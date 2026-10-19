/**
 * @embedpdf/angular/annotation: drawing, selecting, changing and saving annotations.
 *
 *   withAnnotation(options)                     the plugin, for provideEmbedPdf() (with withInteraction())
 *   withFilePicker(provider?)                   the file dialog behind the stamp and attachment tools
 *   inject(EpdfAnnotation)                      the API, the State table as signals, the events as
 *                                               streams, and `watch()`, `anchorOf()`, `tools.defaultsOf()`
 *   inject(EpdfComments)                        threads and replies: `threads()`, `threadOf(ref)`, `reply()`, …
 *   <epdf-annotation-layer>                     the annotations, the selection and the text boxes, in each page
 *     <ng-template [epdfAnnotation]>              your own look for some annotations
 *     <ng-template epdfHandle>, epdfRotationHandle    your own handles
 *   [epdfRichTextEditor]                        your element as a text box's editor, in a look
 *   <epdf-annotation-menu>                      your menu next to the selection, inside <epdf-stage>
 *   <epdf-annotation-draft-menu>                buttons over a polygon being drawn
 *   <epdf-annotation-rotation-badge>            the angle while a selection is turned
 */

// The plugin's types and helpers, so app code has one import for the feature.
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
export { EpdfAnnotation, withAnnotation } from './annotation';
export type { EpdfAnnotationSelection, EpdfAnnotationTools } from './annotation';
export { EpdfComments } from './comments';
export type { CommentThreadView } from './comments';
export { filePickerProvider, withFilePicker } from './file-picker';
export { EpdfAnnotationLayer } from './annotation-layer';
export {
  EpdfAnnotationBehaviorTemplate,
  EpdfAnnotationTemplate,
  EpdfHandleTemplate,
  EpdfRotationBadgeTemplate,
  EpdfRotationHandleTemplate,
} from './templates';
export type {
  AnnotationBehaviorRenderer,
  AnnotationFrame,
  AnnotationInteractive,
  AnnotationInteractiveContext,
  AnnotationLookRenderer,
  AnnotationMatch,
  AnnotationRendererEntry,
  EpdfAnnotationBehaviorTemplateContext,
  EpdfAnnotationTemplateContext,
  EpdfHandleTemplateContext,
  EpdfRotationBadgeTemplateContext,
  EpdfRotationHandleTemplateContext,
  HandleProps,
  RotationHandleProps,
} from './templates';
export { EpdfRichTextEditor } from './text-box';
export {
  EpdfAnnotationDraftMenu,
  EpdfAnnotationMenu,
  EpdfAnnotationRotationBadge,
} from './annotation-menu';
