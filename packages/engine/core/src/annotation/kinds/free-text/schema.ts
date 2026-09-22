import { z } from 'zod';

import type { FreeTextDraft } from './draft';
import type { FreeTextAnnotationDTO } from './dto';
import type { FreeTextPatch } from './patch';
import type {
  RichTextDocument,
  RichTextDocumentInput,
  RichTextParagraph,
  RichTextRunStyle,
} from '../../../dto/RichText';
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

/** Authoring `fontFamily`: a standard font name or a registered font `key`.
 *  Any non-empty string is accepted; the writer resolves which it is (and a
 *  key that was never registered fails loud there). The read-back DTO keeps the
 *  narrower {@link StandardFontSchema}. */
const FreeTextFontSchema = z.string().min(1) as unknown as z.ZodType<FreeTextFont>;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const RichTextRunStyleShape = {
  family: z.string().min(1),
  weight: z.number().int().min(100).max(900),
  italic: z.boolean(),
  size: z.number().nonnegative(),
  color: HexColorSchema,
  decoration: z.array(z.enum(['underline', 'line-through', 'word'])),
  script: z.enum(['normal', 'sub', 'super']),
  letterSpacing: z.number(),
  horizontalScale: z.number().positive(),
  unknown: z.string().optional(),
};
const RichTextParagraphPropsShape = {
  align: z.enum(['left', 'center', 'right', 'justify']),
  dir: z.enum(['ltr', 'rtl']),
  lineHeight: z.number().positive().optional(),
  margins: z
    .object({ top: z.number(), bottom: z.number(), left: z.number(), right: z.number() })
    .optional(),
  textIndent: z.number().optional(),
  unknown: z.string().optional(),
};
const RichTextRunStyleDeltaSchema: z.ZodType<Partial<RichTextRunStyle>> = z
  .object(RichTextRunStyleShape)
  .partial();
const RichTextParagraphSchema: z.ZodType<RichTextParagraph> = z
  .object({
    ...RichTextParagraphPropsShape,
    runs: z.array(z.object({ text: z.string(), style: RichTextRunStyleDeltaSchema.optional() })),
  })
  .partial({ align: true, dir: true }) as unknown as z.ZodType<RichTextParagraph>;
export const RichTextDocumentSchema: z.ZodType<RichTextDocument> = z.object({
  body: z.object({ ...RichTextRunStyleShape, ...RichTextParagraphPropsShape }),
  paragraphs: z.array(RichTextParagraphSchema),
}) as unknown as z.ZodType<RichTextDocument>;
export const RichTextDocumentInputSchema: z.ZodType<RichTextDocumentInput> = z.object({
  body: z
    .object({ ...RichTextRunStyleShape, ...RichTextParagraphPropsShape })
    .partial()
    .optional(),
  paragraphs: z.array(RichTextParagraphSchema),
}) as unknown as z.ZodType<RichTextDocumentInput>;

export const FreeTextDTOSchema: z.ZodType<FreeTextAnnotationDTO> = z.object({
  ...AnnotationBaseShape,
  intent: FreeTextIntentSchema,
  fontFamily: FreeTextFontSchema,
  fontSize: z.number().positive(),
  textAlign: TextAlignmentSchema,
  richText: RichTextDocumentSchema,
  color: ColorSchema,
  fontColor: ColorSchema.optional(),
  interiorColor: ColorSchema.nullable(),
  opacity: z.number().min(0).max(1),
  strokeWidth: z.number().nonnegative(),
  borderStyle: AnnotationBorderStyleSchema,
  dashArray: z.array(z.number().nonnegative()).optional(),
  rectDifferences: PdfRectDifferencesSchema.nullable(),
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
  richText: RichTextDocumentInputSchema.optional(),
  rect: PdfRectSchema,
  color: ColorSchema.optional(),
  fontColor: ColorSchema.optional(),
  interiorColor: ColorSchema.nullable().optional(),
  opacity: z.number().min(0).max(1).optional(),
  strokeWidth: z.number().nonnegative().optional(),
  borderStyle: AnnotationBorderStyleSchema.optional(),
  dashArray: z.array(z.number().nonnegative()).optional(),
  rectDifferences: PdfRectDifferencesSchema.nullable().optional(),
  calloutLine: CalloutLineSchema.optional(),
  lineEnding: LineEndingSchema.optional(),
  rotation: z.number().nullable().optional(),
  unrotatedRect: PdfRectSchema.nullable().optional(),
  subtype: z.literal('free-text'),
});

export const FreeTextPatchSchema: z.ZodType<FreeTextPatch> = z.object({
  ...AnnotationPatchBaseShape,
  intent: FreeTextIntentSchema.optional(),
  fontFamily: FreeTextFontSchema.optional(),
  fontSize: z.number().positive().optional(),
  textAlign: TextAlignmentSchema.optional(),
  richText: RichTextDocumentInputSchema.optional(),
  rect: PdfRectSchema.optional(),
  color: ColorSchema.optional(),
  fontColor: ColorSchema.optional(),
  interiorColor: ColorSchema.nullable().optional(),
  opacity: z.number().min(0).max(1).optional(),
  strokeWidth: z.number().nonnegative().optional(),
  borderStyle: AnnotationBorderStyleSchema.optional(),
  dashArray: z.array(z.number().nonnegative()).optional(),
  rectDifferences: PdfRectDifferencesSchema.nullable().optional(),
  calloutLine: CalloutLineSchema.optional(),
  lineEnding: LineEndingSchema.optional(),
  rotation: z.number().nullable().optional(),
  unrotatedRect: PdfRectSchema.nullable().optional(),
  subtype: z.literal('free-text'),
});
