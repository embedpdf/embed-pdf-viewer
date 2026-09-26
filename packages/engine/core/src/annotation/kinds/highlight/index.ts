import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { HighlightDeclaration } from './declaration';

export { HighlightDeclaration } from './declaration';

export type HighlightAnnotationDTO = ReadOf<typeof HighlightDeclaration>;
export type HighlightDraft = CreateOf<typeof HighlightDeclaration>;
export type HighlightPatch = UpdateOf<typeof HighlightDeclaration>;

export const HighlightDTOSchema = HighlightDeclaration.readSchema;
export const HighlightDraftSchema = HighlightDeclaration.createSchema;
export const HighlightPatchSchema = HighlightDeclaration.updateSchema;

export const HighlightKind: AnnotationKindModule<
  'highlight',
  HighlightAnnotationDTO,
  HighlightDraft,
  HighlightPatch
> = {
  subtype: 'highlight',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.HIGHLIGHT,
  dtoSchema: HighlightDTOSchema,
  draftSchema: HighlightDraftSchema,
  patchSchema: HighlightPatchSchema,
  readBackWrites: HighlightDeclaration.readBackWrites,
};
