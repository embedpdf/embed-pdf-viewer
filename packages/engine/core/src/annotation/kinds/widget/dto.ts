import type { FormFieldFamily } from '../../../forms/field';
import type { AnnotationBase } from '../../base';
import type { WidgetStyleFields } from '../widget.shared';

/**
 * A form widget annotation: the page-scoped VIEW of a logical form field.
 * The value, options, and field semantics live on `doc.forms`; this DTO
 * carries the widget plane only — geometry, appearance, and the join key.
 *
 * Widgets are readable and patchable like every kind, and creatable as
 * INERT annotations (no field). Adoption by a field — and deletion while
 * adopted — go through `doc.forms` (`attachWidget` / `deleteField`), which
 * own the field-tree bookkeeping.
 */
export interface WidgetAnnotationDTO extends AnnotationBase, WidgetStyleFields {
  subtype: 'widget';
  /**
   * Object number of the owning field's dictionary, or `0` when the
   * widget is unattached (inert). Join key to `FormFieldDTO.ref` /
   * `FormFieldWidget.annotObjectNumber` on the forms side.
   */
  fieldObjectNumber: number;
  /**
   * The owning field's family when attached — what kind of control this
   * widget renders. `'unknown'` for inert widgets (no field yet). Client
   * kind tables key per-family editing surfaces (a radio widget has no
   * font) off this without consulting the forms snapshot.
   */
  fieldFamily: FormFieldFamily;
}
