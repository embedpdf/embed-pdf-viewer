import { z } from 'zod';

import { PdfRectSchema } from '../../../geometry/schemas';
import {
  AnnotationBaseShape,
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
  CaretIntentSchema,
  PdfRectDifferencesSchema,
} from '../../base.schema';
import { ColorStyleDTOShape, ColorStyleDraftShape, ColorStylePatchShape } from '../style.shared';
import type { CaretDraft } from './draft';
import type { CaretAnnotationDTO } from './dto';
import type { CaretPatch } from './patch';

export const CaretDTOSchema: z.ZodType<CaretAnnotationDTO> = z.object({
  ...AnnotationBaseShape,
  ...ColorStyleDTOShape,
  intent: CaretIntentSchema.nullable(),
  rectDifferences: PdfRectDifferencesSchema.optional(),
  subtype: z.literal('caret'),
}) as unknown as z.ZodType<CaretAnnotationDTO>;

export const CaretDraftSchema: z.ZodType<CaretDraft> = z.object({
  ...ColorStyleDraftShape,
  ...AnnotationDraftBaseShape,
  intent: CaretIntentSchema.optional(),
  rect: PdfRectSchema,
  rectDifferences: PdfRectDifferencesSchema.optional(),
  subtype: z.literal('caret'),
});

export const CaretPatchSchema: z.ZodType<CaretPatch> = z.object({
  ...ColorStylePatchShape,
  ...AnnotationPatchBaseShape,
  intent: CaretIntentSchema.optional(),
  rect: PdfRectSchema.optional(),
  rectDifferences: PdfRectDifferencesSchema.optional(),
  subtype: z.literal('caret'),
});
