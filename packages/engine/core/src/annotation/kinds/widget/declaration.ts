import { z } from 'zod';

import {
  AnnotationBorderStyleSchema,
  ColorSchema,
  StandardFontSchema,
  TextAlignmentSchema,
} from '../../base.schema';
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
  fieldObjectNumber: field.engine(z.number().int().nonnegative()),
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
