import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { Coordinates, PageCoordinates } from '../../../pageSpace/coordinates';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { LinkDeclaration } from './declaration';

export { LinkDeclaration } from './declaration';
export { PdfDestinationSchema, PdfLinkTargetSchema, PdfLinkTargetWritableSchema } from './values';

export type LinkAnnotation<C extends Coordinates = PageCoordinates> = ReadOf<
  typeof LinkDeclaration,
  C
>;
export type LinkDraft<C extends Coordinates = PageCoordinates> = CreateOf<
  typeof LinkDeclaration,
  C
>;
export type LinkPatch<C extends Coordinates = PageCoordinates> = UpdateOf<
  typeof LinkDeclaration,
  C
>;

export const LinkDTOSchema = LinkDeclaration.readSchema;
export const LinkDraftSchema = LinkDeclaration.createSchema;
export const LinkPatchSchema = LinkDeclaration.updateSchema;

export const LinkKind: AnnotationKindModule<'link', LinkAnnotation, LinkDraft, LinkPatch> = {
  subtype: 'link',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.LINK,
  dtoSchema: LinkDTOSchema,
  draftSchema: LinkDraftSchema,
  patchSchema: LinkPatchSchema,
  readBackWrites: LinkDeclaration.readBackWrites,
};
