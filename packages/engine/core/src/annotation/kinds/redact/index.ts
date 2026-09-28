import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { RedactDeclaration } from './declaration';

export { RedactDeclaration } from './declaration';

export type RedactAnnotationDTO<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof RedactDeclaration,
  C
>;
export type RedactDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof RedactDeclaration,
  C
>;
export type RedactPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof RedactDeclaration,
  C
>;

export const RedactDTOSchema = RedactDeclaration.readSchema;
export const RedactDraftSchema = RedactDeclaration.createSchema;
export const RedactPatchSchema = RedactDeclaration.updateSchema;

export const RedactKind: AnnotationKindModule<
  'redact',
  RedactAnnotationDTO,
  RedactDraft,
  RedactPatch
> = {
  subtype: 'redact',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.REDACT,
  dtoSchema: RedactDTOSchema,
  draftSchema: RedactDraftSchema,
  patchSchema: RedactPatchSchema,
  readBackWrites: RedactDeclaration.readBackWrites,
};
