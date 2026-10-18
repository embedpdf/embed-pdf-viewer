import { z } from 'zod';

import type {
  DocumentOutline,
  OutlineItem,
  OutlineItemDraft,
  OutlineItemPatch,
} from './DocumentOutline';
import { PdfActionTreeSchema } from './PdfAction.schema';
import { ColorSchema } from '../annotation/base.schema';
import { PdfLinkTargetSchema, PdfLinkTargetWritableSchema } from '../annotation/kinds/link/values';
import { OutlineItemRefSchema } from '../identity/OutlineItemRef.schema';

/** Wire form of an `OutlineItem` (page space) — see the type. */
export const OutlineItemSchema: z.ZodType<OutlineItem> = z.object({
  ref: OutlineItemRefSchema,
  parent: OutlineItemRefSchema.nullable(),
  title: z.string(),
  target: PdfLinkTargetSchema.nullable(),
  action: PdfActionTreeSchema.nullable(),
  open: z.boolean(),
  color: ColorSchema.nullable(),
  bold: z.boolean(),
  italic: z.boolean(),
});

/** Wire form of a `DocumentOutline` (page space): what `GET …/outline` answers. */
export const DocumentOutlineSchema: z.ZodType<DocumentOutline> = z.object({
  items: z.array(OutlineItemSchema),
  incomplete: z.boolean(),
});

/**
 * A title as a write takes it: at most 32,767 UTF-16 code units, the most a
 * PDF text string holds in every PDF app (ISO 32000-2 Annex C).
 */
const OutlineTitleSchema = z.string().max(32_767);

const outlineFields = {
  title: OutlineTitleSchema,
  target: PdfLinkTargetWritableSchema.nullable().optional(),
  color: ColorSchema.nullable().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
};

/** Wire form of an `OutlineItemDraft` (page space). */
export const OutlineItemDraftSchema: z.ZodType<OutlineItemDraft> = z.object(outlineFields).strict();

/** Wire form of an `OutlineItemPatch` (page space). */
export const OutlineItemPatchSchema: z.ZodType<OutlineItemPatch> = z
  .object({ ...outlineFields, title: OutlineTitleSchema.optional(), open: z.boolean().optional() })
  .strict();
