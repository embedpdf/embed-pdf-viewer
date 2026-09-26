import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { LinkDeclaration } from './declaration';

export { LinkDeclaration } from './declaration';
export { PdfDestinationSchema, PdfLinkTargetSchema, PdfLinkTargetWritableSchema } from './values';

export type LinkAnnotationDTO = ReadOf<typeof LinkDeclaration>;
export type LinkDraft = CreateOf<typeof LinkDeclaration>;
export type LinkPatch = UpdateOf<typeof LinkDeclaration>;

export const LinkDTOSchema = LinkDeclaration.readSchema;
export const LinkDraftSchema = LinkDeclaration.createSchema;
export const LinkPatchSchema = LinkDeclaration.updateSchema;

export const LinkKind: AnnotationKindModule<'link', LinkAnnotationDTO, LinkDraft, LinkPatch> = {
  subtype: 'link',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.LINK,
  dtoSchema: LinkDTOSchema,
  draftSchema: LinkDraftSchema,
  patchSchema: LinkPatchSchema,
  readBackWrites: LinkDeclaration.readBackWrites,
};
