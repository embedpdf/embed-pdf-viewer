import { z } from 'zod';

import type { BinarySource, ResourceRef } from '../../../resource/BinarySource';
import type { CreateOf, ReadOf, UpdateOf } from '../../declaration';
import type { AnnotationKindModule } from '../../registry';
import { PdfAnnotationSubtypeCode } from '../../subtype';
import { StampDeclaration } from './declaration';
import { ResourceRefSchema, StampFitSchema, type StampFit } from './values';

export { StampDeclaration } from './declaration';
export { ResourceRefSchema, StampFitSchema } from './values';
export type { StampFit } from './values';

export type StampAnnotationDTO = ReadOf<typeof StampDeclaration>;

/** The stamp's image travels in the draft as `source`, scaled into the box by `fit`. */
interface StampSource<Source> {
  source: Source;
  /** Default `'contain'`. */
  fit?: StampFit;
}

export type StampDraft = CreateOf<typeof StampDeclaration> & StampSource<BinarySource>;
export type StampWireDraft = CreateOf<typeof StampDeclaration> & StampSource<ResourceRef>;
export type StampPatch = UpdateOf<typeof StampDeclaration> & Partial<StampSource<BinarySource>>;
export type StampWirePatch = UpdateOf<typeof StampDeclaration> & Partial<StampSource<ResourceRef>>;

export const StampDTOSchema = StampDeclaration.readSchema;
export const StampWireDraftSchema = z
  .object({
    ...StampDeclaration.shapes.create,
    source: ResourceRefSchema,
    fit: StampFitSchema.optional(),
  })
  .strict() as unknown as z.ZodType<StampWireDraft>;
export const StampWirePatchSchema = z
  .object({
    ...StampDeclaration.shapes.update,
    source: ResourceRefSchema.optional(),
    fit: StampFitSchema.optional(),
  })
  .strict() as unknown as z.ZodType<StampWirePatch>;

/**
 * Wire-typed: the draft and patch schemas validate the form after
 * normalization, with `source` as a resource ref. The authoring types carry
 * the bytes and are swapped into the public unions in `kinds/index.ts`.
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
