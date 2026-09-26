import { defineKind, field } from '../../declaration';
import { annotationBaseFields } from '../shared-fields';
import { PdfLinkTargetSchema, PdfLinkTargetWritableSchema } from './values';

export const LinkDeclaration = defineKind('link', {
  ...annotationBaseFields,
  target: field.data(PdfLinkTargetSchema).writes(PdfLinkTargetWritableSchema).nullable().readBack(),
});
