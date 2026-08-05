import type { StampDraft, StampWireDraft } from './draft';
import type { StampAnnotationDTO } from './dto';
import type { StampPatch, StampWirePatch } from './patch';
import { StampDTOSchema, StampWireDraftSchema, StampWirePatchSchema } from './schema';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';

export type { StampAnnotationDTO } from './dto';
export type { StampDraft, StampWireDraft, StampFit } from './draft';
export type { StampPatch, StampWirePatch } from './patch';
export {
  StampDTOSchema,
  StampWireDraftSchema,
  StampWirePatchSchema,
  ResourceRefSchema,
} from './schema';
export { normalizeStampDraft, normalizeStampPatch } from './normalize';

/**
 * The kind module is WIRE-typed (schemas validate the post-normalization
 * form). The authoring types with inline bytes (`StampDraft`, `StampPatch`)
 * are swapped into the public `AnnotationDraft`/`AnnotationPatch` unions in
 * `kinds/index.ts`; `annotation/normalize.ts` bridges the two.
 */
export const StampKind: AnnotationKindModule<
  'stamp',
  StampAnnotationDTO,
  StampWireDraft,
  StampWirePatch
> = {
  subtype: 'stamp',
  pdfSubtypeCode: PdfAnnotationSubtypeCode.STAMP,
  dtoSchema: StampDTOSchema,
  draftSchema: StampWireDraftSchema,
  patchSchema: StampWirePatchSchema,
};
