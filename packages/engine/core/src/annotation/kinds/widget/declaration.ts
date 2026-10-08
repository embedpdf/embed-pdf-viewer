import { z } from 'zod';

import {
  AnnotationBorderStyleSchema,
  ColorSchema,
  StandardFontSchema,
  TextAlignmentSchema,
} from '../../base.schema';
import {
  FileAnnotationActionsSchema,
  FileWidgetActionsPatchSchema,
} from '../../../dto/PdfAction.schema';
import { FormFieldRefSchema } from '../../../identity/FormFieldRef.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields } from '../shared-fields';

export const WidgetDeclaration = defineKind('widget', {
  ...annotationBaseFields,
  color: field.data(ColorSchema).nullable().optional(),
  interiorColor: field.data(ColorSchema).nullable().optional(),
  strokeWidth: field.data(z.number().nonnegative()).optional(),
  borderStyle: field.data(AnnotationBorderStyleSchema).optional(),
  fontFamily: field.data(StandardFontSchema).nullable().optional(),
  fontSize: field.data(z.number().nonnegative()).nullable().optional(),
  fontColor: field.data(ColorSchema).nullable().optional(),
  textAlign: field.data(TextAlignmentSchema).optional(),
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
  /** Its field's family, so a widget reads as what it is without the form. */
  fieldFamily: field.engine(
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
  ),
});
