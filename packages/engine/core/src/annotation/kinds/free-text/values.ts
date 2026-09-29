import { z } from 'zod';

import { ColorSchema } from '../../base.schema';
import type {
  RichTextAlign,
  RichTextDocument,
  RichTextDocumentInput,
  RichTextParagraph,
  RichTextRunStyle,
} from '../../../dto/RichText';

/** How a paragraph's lines line up: a free text's `textAlign` too. */
export const RichTextAlignSchema: z.ZodType<RichTextAlign> = z.enum([
  'left',
  'center',
  'right',
  'justify',
]);

const RichTextRunStyleShape = {
  family: z.string().min(1),
  weight: z.number().int().min(100).max(900),
  italic: z.boolean(),
  size: z.number().nonnegative(),
  color: ColorSchema,
  decoration: z.array(z.enum(['underline', 'line-through', 'word'])),
  script: z.enum(['normal', 'sub', 'super']),
  letterSpacing: z.number(),
  horizontalScale: z.number().positive(),
  unknown: z.string().optional(),
};
const RichTextParagraphPropsShape = {
  align: RichTextAlignSchema,
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
