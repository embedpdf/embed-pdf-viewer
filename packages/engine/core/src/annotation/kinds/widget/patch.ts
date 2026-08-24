import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';
import type { WidgetStylePatchFields } from '../widget.shared';

/**
 * Move (`rect`) and restyle a widget through the annotation plane — the
 * same path every other kind uses. When the widget is attached to a field
 * the engine re-bakes the family-correct appearance after the patch.
 */
export interface WidgetPatch extends AnnotationPatchBase, WidgetStylePatchFields {
  subtype: 'widget';
  rect?: PdfRect;
}
