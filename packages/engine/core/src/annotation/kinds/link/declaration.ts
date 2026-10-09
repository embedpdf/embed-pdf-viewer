import { defineKind, field } from '../../declaration';
import { annotationBaseFields } from '../shared-fields';
import { FileLinkTargetSchema, FileLinkTargetWritableSchema } from './values';

export const LinkDeclaration = defineKind('link', {
  ...annotationBaseFields,
  target: field
    .data(FileLinkTargetSchema)
    .writes(FileLinkTargetWritableSchema)
    .nullable()
    .readBack()
    .space('linkTarget'),
});
