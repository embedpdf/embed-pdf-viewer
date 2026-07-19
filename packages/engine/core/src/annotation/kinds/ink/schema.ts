import { z } from 'zod';

import { InkListSchema, PdfRectSchema } from '../../../geometry/schemas';
import {
  AnnotationBaseShape,
  AnnotationDraftBaseShape,
  InkIntentSchema,
  AnnotationPatchBaseShape,
} from '../../base.schema';
import {
  GeometryStyleDTOShape,
  GeometryStyleDraftShape,
  GeometryStylePatchShape,
} from '../style.shared';
import type { InkDraft } from './draft';
import type { InkAnnotationDTO } from './dto';
import type { InkPatch } from './patch';

export const InkDTOSchema: z.ZodType<InkAnnotationDTO> = z.object({
  ...AnnotationBaseShape,
  ...GeometryStyleDTOShape,
  intent: InkIntentSchema.nullable(),
  inkList: InkListSchema,
  rotation: z.number().optional(),
  subtype: z.literal('ink'),
}) as unknown as z.ZodType<InkAnnotationDTO>;

export const InkDraftSchema: z.ZodType<InkDraft> = z.object({
  ...GeometryStyleDraftShape,
  ...AnnotationDraftBaseShape,
  intent: InkIntentSchema.optional(),
  inkList: InkListSchema,
  rect: PdfRectSchema,
  rotation: z.number().optional(),
  subtype: z.literal('ink'),
});

export const InkPatchSchema: z.ZodType<InkPatch> = z.object({
  ...GeometryStylePatchShape,
  ...AnnotationPatchBaseShape,
  intent: InkIntentSchema.optional(),
  inkList: InkListSchema.optional(),
  rect: PdfRectSchema.optional(),
  rotation: z.number().optional(),
  subtype: z.literal('ink'),
});
