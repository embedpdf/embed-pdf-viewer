import { z } from 'zod';

import { AnnotationRefSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields } from '../shared-fields';

/** The window that shows its parent annotation's text. */
export const PopupDeclaration = defineKind('popup', {
  ...annotationBaseFields,
  /**
   * `/Parent`: the annotation this popup shows. Required on create; `null`
   * on a read of a popup whose PDF names none, which an update may send
   * back unchanged.
   */
  parent: field.data(AnnotationRefSchema).nullableOnRead().readBack(),
  /** `/Open`: whether the window is shown open. `false` when the PDF doesn't say. */
  open: field.data(z.boolean()).optional(),
});
