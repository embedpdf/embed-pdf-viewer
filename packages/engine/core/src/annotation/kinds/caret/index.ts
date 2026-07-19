import type { CaretDraft } from './draft';
import type { CaretAnnotationDTO } from './dto';
import type { CaretPatch } from './patch';
import { CaretDTOSchema, CaretDraftSchema, CaretPatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { CaretAnnotationDTO } from './dto';
export type { CaretDraft } from './draft';
export type { CaretPatch } from './patch';
export { CaretDTOSchema, CaretDraftSchema, CaretPatchSchema } from './schema';

export const CaretKind: AnnotationKindModule<'caret', CaretAnnotationDTO, CaretDraft, CaretPatch> =
  {
    subtype: 'caret',
    pdfSubtypeCode: PdfAnnotationSubtypeCode.CARET,
    dtoSchema: CaretDTOSchema,
    draftSchema: CaretDraftSchema,
    patchSchema: CaretPatchSchema,
  };
