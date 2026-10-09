import type { CreateShape, ReadShape, UpdateShape } from '../declaration';
import type { annotationBaseFields, textMarkupFields } from './shared-fields';
import type { Coordinates, PageCoordinates } from '../../pageSpace/coordinates';

type BaseName = keyof typeof annotationBaseFields;

/** The fields a highlight, underline, squiggly or strikeout adds to the base. */
export type TextMarkupAnnotationFields<C extends Coordinates = PageCoordinates> = Omit<
  ReadShape<typeof textMarkupFields, C>,
  BaseName
>;
export type TextMarkupDraftFields<C extends Coordinates = PageCoordinates> = Omit<
  CreateShape<typeof textMarkupFields, C>,
  BaseName
>;
export type TextMarkupPatchFields<C extends Coordinates = PageCoordinates> = Omit<
  UpdateShape<typeof textMarkupFields, C>,
  BaseName
>;
