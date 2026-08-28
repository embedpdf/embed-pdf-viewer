import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationDraftBase } from '../../draft-base';
import type { AnnotationState, AnnotationStateModel } from '../../primitives';
import type { ColorStyleDraftFields } from '../style.shared';

/**
 * `/Name` icon of a text (sticky-note) annotation — ISO 32000 §12.5.6.4.
 * The appearance generator currently draws one note glyph for every icon;
 * the name still round-trips so other viewers can render their own set.
 */
export type NoteIcon =
  | 'comment'
  | 'key'
  | 'note'
  | 'help'
  | 'new-paragraph'
  | 'paragraph'
  | 'insert';

/**
 * Text annotation ("sticky note", `/Subtype /Text`). The generated
 * appearance is a fixed 20×20 icon anchored at the `/Rect`'s bottom-left
 * corner, filled with `color` (`/C`, default yellow) and outlined with a
 * luminance-contrast stroke. Note tools typically also set
 * `flags: { print: true, noZoom: true, noRotate: true }`.
 */
export interface TextDraft extends AnnotationDraftBase, ColorStyleDraftFields {
  subtype: 'text';
  /** `/Rect` — the icon renders 20×20 from this rect's bottom-left corner. */
  rect: PdfRect;
  /** `/Name` icon. Default `'note'` (the ISO 32000 default). */
  icon?: NoteIcon;
  /**
   * Write `/State` + `/StateModel`, making this draft an ISO 32000
   * §12.5.6.3 review-status reply (pair with `inReplyTo` → the annotation
   * under review). `state` requires `stateModel` — the engine throws
   * `InvalidArg` otherwise. `stateModel` alone is valid: the model's
   * default state applies (`none` for review, `unmarked` for marked).
   */
  state?: AnnotationState;
  /** See {@link state}. */
  stateModel?: AnnotationStateModel;
}
