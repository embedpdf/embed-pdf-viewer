import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { CaretDeclaration } from './declaration';

export { CaretDeclaration } from './declaration';

export type CaretAnnotationDTO = ReadOf<typeof CaretDeclaration>;
export type CaretDraft = CreateOf<typeof CaretDeclaration>;
export type CaretPatch = UpdateOf<typeof CaretDeclaration>;

export const CaretDTOSchema = CaretDeclaration.readSchema;
export const CaretDraftSchema = CaretDeclaration.createSchema;
export const CaretPatchSchema = CaretDeclaration.updateSchema;

export const CaretKind: AnnotationKindModule<'caret', CaretAnnotationDTO, CaretDraft, CaretPatch> =
  {
    subtype: 'caret',
    pdfSubtypeCode: PdfAnnotationSubtypeCode.CARET,
    dtoSchema: CaretDTOSchema,
    draftSchema: CaretDraftSchema,
    patchSchema: CaretPatchSchema,
    readBackWrites: CaretDeclaration.readBackWrites,
  };
