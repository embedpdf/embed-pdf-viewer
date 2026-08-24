import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import type { LinkDraft } from './draft';
import type { LinkAnnotationDTO } from './dto';
import type { LinkPatch } from './patch';
import { LinkDTOSchema, LinkDraftSchema, LinkPatchSchema } from './schema';

export type { LinkAnnotationDTO } from './dto';
export type { LinkDraft } from './draft';
export type { LinkPatch } from './patch';
export {
  LinkDTOSchema,
  LinkDraftSchema,
  LinkPatchSchema,
  PdfDestinationSchema,
  PdfLinkTargetSchema,
  PdfLinkTargetWritableSchema,
} from './schema';

export const LinkKind: AnnotationKindModule<'link', LinkAnnotationDTO, LinkDraft, LinkPatch> = {
  subtype: 'link',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.LINK,
  dtoSchema: LinkDTOSchema,
  draftSchema: LinkDraftSchema,
  patchSchema: LinkPatchSchema,
};
