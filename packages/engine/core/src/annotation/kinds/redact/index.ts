import type { RedactDraft } from './draft';
import type { RedactAnnotationDTO } from './dto';
import type { RedactPatch } from './patch';
import { RedactDTOSchema, RedactDraftSchema, RedactPatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { RedactAnnotationDTO } from './dto';
export type { RedactDraft } from './draft';
export type { RedactPatch } from './patch';
export { RedactDTOSchema, RedactDraftSchema, RedactPatchSchema } from './schema';

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
};
