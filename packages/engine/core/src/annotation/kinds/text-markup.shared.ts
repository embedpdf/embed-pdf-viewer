import type { CreateShape, ReadShape, UpdateShape } from '../declaration';
import type { annotationBaseFields, textMarkupFields } from './shared-fields';

type BaseName = keyof typeof annotationBaseFields;

/** The fields a highlight, underline, squiggly or strikeout adds to the base. */
export type TextMarkupAnnotationFields = Omit<ReadShape<typeof textMarkupFields>, BaseName>;
export type TextMarkupDraftFields = Omit<CreateShape<typeof textMarkupFields>, BaseName>;
export type TextMarkupPatchFields = Omit<UpdateShape<typeof textMarkupFields>, BaseName>;
