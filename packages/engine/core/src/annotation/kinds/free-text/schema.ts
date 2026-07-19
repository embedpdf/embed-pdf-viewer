import { z } from 'zod';

import type { FreeTextDraft } from './draft';
import type { FreeTextAnnotationDTO } from './dto';
import type { FreeTextPatch } from './patch';
import { CalloutLineSchema, PdfRectSchema } from '../../../geometry/schemas';
import {
  AnnotationBaseShape,
  AnnotationBorderStyleSchema,
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
  ColorSchema,
  FreeTextIntentSchema,
  LineEndingSchema,
  PdfRectDifferencesSchema,
  StandardFontSchema,
  TextAlignmentSchema,
} from '../../base.schema';
import type { FreeTextFont } from '../../primitives';

/** Authoring `fontFamily`: a standard font name OR a registered font `key`.
 *  Any non-empty string is accepted; the writer resolves which it is (and a
 *  key that was never registered fails loud there). The read-back DTO keeps the
 *  narrower {@link StandardFontSchema}. */
const FreeTextFontSchema = z.string().min(1) as unknown as z.ZodType<FreeTextFont>;

export const FreeTextDTOSchema: z.ZodType<FreeTextAnnotationDTO> = z.object({
  ...AnnotationBaseShape,
  intent: FreeTextIntentSchema,
  fontFamily: StandardFontSchema,
  fontSize: z.number().positive(),
  textAlign: TextAlignmentSchema,
  color: ColorSchema,
  fontColor: ColorSchema.optional(),
  interiorColor: ColorSchema.nullable(),
  opacity: z.number().min(0).max(1),
  strokeWidth: z.number().nonnegative(),
  borderStyle: AnnotationBorderStyleSchema,
  dashArray: z.array(z.number().nonnegative()).optional(),
  rectDifferences: PdfRectDifferencesSchema.optional(),
  calloutLine: CalloutLineSchema.optional(),
  lineEnding: LineEndingSchema.optional(),
  rotation: z.number().optional(),
  unrotatedRect: PdfRectSchema.optional(),
  subtype: z.literal('free-text'),
}) as unknown as z.ZodType<FreeTextAnnotationDTO>;

export const FreeTextDraftSchema: z.ZodType<FreeTextDraft> = z.object({
  ...AnnotationDraftBaseShape,
  intent: FreeTextIntentSchema,
  fontFamily: FreeTextFontSchema,
  fontSize: z.number().positive(),
  textAlign: TextAlignmentSchema,
  rect: PdfRectSchema,
  color: ColorSchema.optional(),
  fontColor: ColorSchema.optional(),
  interiorColor: ColorSchema.nullable().optional(),
  opacity: z.number().min(0).max(1).optional(),
  strokeWidth: z.number().nonnegative().optional(),
  borderStyle: AnnotationBorderStyleSchema.optional(),
  dashArray: z.array(z.number().nonnegative()).optional(),
  rectDifferences: PdfRectDifferencesSchema.optional(),
  calloutLine: CalloutLineSchema.optional(),
  lineEnding: LineEndingSchema.optional(),
  rotation: z.number().optional(),
  unrotatedRect: PdfRectSchema.optional(),
  subtype: z.literal('free-text'),
});

export const FreeTextPatchSchema: z.ZodType<FreeTextPatch> = z.object({
  ...AnnotationPatchBaseShape,
  intent: FreeTextIntentSchema.optional(),
  fontFamily: FreeTextFontSchema.optional(),
  fontSize: z.number().positive().optional(),
  textAlign: TextAlignmentSchema.optional(),
  rect: PdfRectSchema.optional(),
  color: ColorSchema.optional(),
  fontColor: ColorSchema.optional(),
  interiorColor: ColorSchema.nullable().optional(),
  opacity: z.number().min(0).max(1).optional(),
  strokeWidth: z.number().nonnegative().optional(),
  borderStyle: AnnotationBorderStyleSchema.optional(),
  dashArray: z.array(z.number().nonnegative()).optional(),
  rectDifferences: PdfRectDifferencesSchema.optional(),
  calloutLine: CalloutLineSchema.optional(),
  lineEnding: LineEndingSchema.optional(),
  rotation: z.number().optional(),
  unrotatedRect: PdfRectSchema.optional(),
  subtype: z.literal('free-text'),
});
