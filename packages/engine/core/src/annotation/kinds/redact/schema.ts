import { z } from 'zod';

import type { RedactDraft } from './draft';
import type { RedactAnnotationDTO } from './dto';
import type { RedactPatch } from './patch';
import { PdfQuadSchema, PdfRectSchema } from '../../../geometry/schemas';
import {
  AnnotationBaseShape,
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
  ColorSchema,
  StandardFontSchema,
  TextAlignmentSchema,
} from '../../base.schema';
import type { FreeTextFont } from '../../primitives';

/** Authoring `fontFamily`: a standard font name OR a registered font `key`.
 *  Any non-empty string is accepted; the writer resolves which it is (and a
 *  key that was never registered fails loud there). The read-back DTO keeps
 *  the narrower {@link StandardFontSchema}. */
const RedactFontSchema = z.string().min(1) as unknown as z.ZodType<FreeTextFont>;

/** `/DA` size — unlike free text, `0` is meaningful for a redaction label:
 *  auto-fit to the region. */
const RedactFontSizeSchema = z.number().nonnegative();

export const RedactDTOSchema: z.ZodType<RedactAnnotationDTO> = z.object({
  ...AnnotationBaseShape,
  quadPoints: z.array(PdfQuadSchema),
  color: ColorSchema,
  opacity: z.number().min(0).max(1),
  interiorColor: ColorSchema.nullable(),
  overlayText: z.string().nullable(),
  repeat: z.boolean(),
  fontFamily: StandardFontSchema,
  fontSize: RedactFontSizeSchema,
  fontColor: ColorSchema,
  textAlign: TextAlignmentSchema,
  subtype: z.literal('redact'),
}) as unknown as z.ZodType<RedactAnnotationDTO>;

export const RedactDraftSchema: z.ZodType<RedactDraft> = z.object({
  ...AnnotationDraftBaseShape,
  rect: PdfRectSchema,
  quadPoints: z.array(PdfQuadSchema).optional(),
  color: ColorSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
  interiorColor: ColorSchema.nullable().optional(),
  overlayText: z.string().optional(),
  repeat: z.boolean().optional(),
  fontFamily: RedactFontSchema.optional(),
  fontSize: RedactFontSizeSchema.optional(),
  fontColor: ColorSchema.optional(),
  textAlign: TextAlignmentSchema.optional(),
  subtype: z.literal('redact'),
});

export const RedactPatchSchema: z.ZodType<RedactPatch> = z.object({
  ...AnnotationPatchBaseShape,
  rect: PdfRectSchema.optional(),
  quadPoints: z.array(PdfQuadSchema).optional(),
  color: ColorSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
  interiorColor: ColorSchema.nullable().optional(),
  overlayText: z.string().nullable().optional(),
  repeat: z.boolean().optional(),
  fontFamily: RedactFontSchema.optional(),
  fontSize: RedactFontSizeSchema.optional(),
  fontColor: ColorSchema.optional(),
  textAlign: TextAlignmentSchema.optional(),
  subtype: z.literal('redact'),
});
