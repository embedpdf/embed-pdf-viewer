import { AnnotationRefSchema } from '../../base.schema';
import { defineKind, field } from '../../declaration';
import { annotationBaseFields } from '../shared-fields';

/** The window that shows its parent annotation's text. */
export const PopupDeclaration = defineKind('popup', {
  ...annotationBaseFields,
  /** `/Parent`: the annotation this popup shows. */
  parent: field.data(AnnotationRefSchema).nullable().optional(),
});
