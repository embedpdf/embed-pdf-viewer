import { z } from 'zod';

import {
  ColorSchema,
  DashArrayWriteSchema,
  TextAlignmentSchema,
  WidgetBorderStyleSchema,
  WidgetCheckStyleSchema,
} from '../../base.schema';
import {
  FileAnnotationActionsSchema,
  FileWidgetActionsPatchSchema,
} from '../../../dto/PdfAction.schema';
import { FormFieldRefSchema } from '../../../identity/FormFieldRef.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields, FontNameSchema, widgetBoxFields } from '../shared-fields';
import { readsUnknownAs } from '../../../wire/reading';

export const WidgetDeclaration = defineKind('widget', {
  ...annotationBaseFields,
  ...widgetBoxFields,
  color: field.data(ColorSchema).nullable().optional(),
  interiorColor: field.data(ColorSchema).nullable().optional(),
  strokeWidth: field.data(z.number().nonnegative()).optional(),
  borderStyle: field.data(WidgetBorderStyleSchema).optional(),
  /**
   * The border's dash pattern (`/BS /D`), for a dashed border. Left out on a dashed border: the
   * default (3 on, 3 off); `null` is no pattern.
   */
  dashArray: field
    .data(z.array(z.number().nonnegative()))
    .writes(DashArrayWriteSchema)
    .nullable()
    .optional(),
  /**
   * The font `/DA` names, as a free text names its font: a standard font's
   * name, a registered font's key, or the family of a font the document has.
   * The widget's `/DA`, else the form's; `null` when neither names one. A
   * write takes a standard name or a key; a font can't be removed, so `null`
   * is only the read sent back, and is refused beside a font (the same for
   * `fontSize` and `fontColor`).
   */
  fontFamily: field.data(FontNameSchema).nullable().optional(),
  fontSize: field.data(z.number().nonnegative()).nullable().optional(),
  fontColor: field.data(ColorSchema).nullable().optional(),
  textAlign: field.data(TextAlignmentSchema).optional(),
  /**
   * A push button's caption (`/MK /CA`), drawn centred on the button.
   * `null` for every other widget, whose `/MK /CA` is no caption (a
   * checkbox's is its symbol); a caption written to one is refused.
   */
  caption: field.data(z.string()).nullable().optional(),
  /**
   * The symbol a checkbox's or radio button's widget shows while it's on
   * (`/MK /CA`); `null` shows its kind's own, a checkbox's check and a
   * radio button's circle. Always `null` for other widgets, and one written
   * to another widget is refused.
   */
  checkStyle: field.data(WidgetCheckStyleSchema).nullable().optional(),
  /**
   * `/A` and `/AA`: what the widget does when clicked, entered, focused and
   * so on. A write sets an event's action, `null` removes it, an event left
   * out keeps what it has; `null` for the whole removes them all. The
   * actions a read returns, sent back unchanged, are kept.
   */
  actions: field
    .data(FileAnnotationActionsSchema)
    .writes(FileWidgetActionsPatchSchema)
    .readBack()
    .nullable()
    .optional()
    .space('actions'),
  /** The field the widget belongs to, or `null` when it's in none. */
  field: field.engine(FormFieldRefSchema).nullable(),
  /** Its field's kind, so a widget reads as what it is without the form. */
  fieldKind: field.engine(
    readsUnknownAs(
      z.enum([
        'text',
        'checkbox',
        'radio',
        'combobox',
        'listbox',
        'pushbutton',
        'signature',
        'unknown',
      ]),
      'unknown',
    ).describe(
      "Its field's family. A newer server can add families: read one your client doesn't " +
        'know as `unknown`.',
    ),
  ),
  /**
   * Whether a mark is in the widget: its field is a signature field that is
   * signed, or that a mark was drawn into without signing
   * (`forms.setSignatureAppearance`). The widget then shows that mark, not
   * its box: its style no longer applies, and a change to it is refused.
   * `false` for every other widget.
   */
  hasMark: field.engine(z.boolean()),
});
