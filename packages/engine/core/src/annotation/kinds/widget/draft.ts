import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationDraftBase } from '../../draft-base';
import type { WidgetStyleDraftFields } from '../widget.shared';

/**
 * Creates an INERT widget annotation — placed and styled, but not yet a
 * form control. Adoption (`doc.forms.attachWidget`, or inline placement in
 * `doc.forms.createField`) is what binds it to a field and bakes the
 * family-correct appearance.
 */
export interface WidgetDraft extends AnnotationDraftBase, WidgetStyleDraftFields {
  subtype: 'widget';
  /** `/Rect` — required; widgets are box-placed. */
  rect: PdfRect;
}
