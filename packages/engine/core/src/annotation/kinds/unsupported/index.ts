import { z } from 'zod';

import type { ReadOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { UnsupportedDeclaration } from './declaration';

export { UnsupportedDeclaration } from './declaration';

export type UnsupportedAnnotationDTO = ReadOf<typeof UnsupportedDeclaration>;
/** An annotation of a type the engine doesn't model can't be created or updated. */
export type UnsupportedDraft = never;
export type UnsupportedPatch = never;

export const UnsupportedDTOSchema = UnsupportedDeclaration.readSchema;
export const UnsupportedDraftSchema: z.ZodType<never> = z.never();
export const UnsupportedPatchSchema: z.ZodType<never> = z.never();

export const UnsupportedKind: AnnotationKindModule<
  'unsupported',
  UnsupportedAnnotationDTO,
  UnsupportedDraft,
  UnsupportedPatch
> = {
  subtype: 'unsupported',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.UNKNOWN,
  dtoSchema: UnsupportedDTOSchema,
  draftSchema: UnsupportedDraftSchema,
  patchSchema: UnsupportedPatchSchema,
};
