import { z } from 'zod';

import { PdfRectSchema } from '../../../geometry/schemas';
import type { ResourceRef } from '../../../resource/BinarySource';
import {
  AnnotationBaseShape,
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
} from '../../base.schema';
import type { StampWireDraft } from './draft';
import type { StampAnnotationDTO } from './dto';
import type { StampWirePatch } from './patch';

/**
 * Schemas validate the WIRE forms. The authoring types (`StampDraft`,
 * `StampPatch`) carry inline `BinarySource` bytes and are normalized to
 * these shapes before validation — see `annotation/normalize.ts`.
 */

export const ResourceRefSchema: z.ZodType<ResourceRef> = z.object({
  resource: z.string().min(1),
});

const StampFitSchema = z.enum(['contain', 'cover', 'fill']);

export const StampDTOSchema: z.ZodType<StampAnnotationDTO> = z.object({
  ...AnnotationBaseShape,
  name: z.string().nullable(),
  rotation: z.number().optional(),
  unrotatedRect: PdfRectSchema.optional(),
  subtype: z.literal('stamp'),
}) as unknown as z.ZodType<StampAnnotationDTO>;

export const StampWireDraftSchema: z.ZodType<StampWireDraft> = z.object({
  ...AnnotationDraftBaseShape,
  rect: PdfRectSchema,
  source: ResourceRefSchema,
  name: z.string().optional(),
  fit: StampFitSchema.optional(),
  rotation: z.number().optional(),
  unrotatedRect: PdfRectSchema.optional(),
  subtype: z.literal('stamp'),
});

export const StampWirePatchSchema: z.ZodType<StampWirePatch> = z.object({
  ...AnnotationPatchBaseShape,
  rect: PdfRectSchema.optional(),
  source: ResourceRefSchema.optional(),
  name: z.string().optional(),
  fit: StampFitSchema.optional(),
  rotation: z.number().optional(),
  unrotatedRect: PdfRectSchema.optional(),
  subtype: z.literal('stamp'),
});
