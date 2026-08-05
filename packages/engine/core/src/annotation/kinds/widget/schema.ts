import { z } from 'zod';

import { PdfRectSchema } from '../../../geometry/schemas';
import {
  AnnotationBaseShape,
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
} from '../../base.schema';
import {
  WidgetStyleDTOShape,
  WidgetStyleDraftShape,
  WidgetStylePatchShape,
} from '../widget.shared';
import type { WidgetAnnotationDTO } from './dto';
import type { WidgetDraft } from './draft';
import type { WidgetPatch } from './patch';

export const WidgetDTOSchema: z.ZodType<WidgetAnnotationDTO> = z.object({
  ...AnnotationBaseShape,
  ...WidgetStyleDTOShape,
  subtype: z.literal('widget'),
  fieldObjectNumber: z.number().int().nonnegative(),
  // Keep in sync with FormFieldFamily (forms/field.ts); inlined to avoid a
  // forms/schema <-> widget schema import loop.
  fieldFamily: z.enum([
    'text',
    'checkbox',
    'radio',
    'combobox',
    'listbox',
    'pushbutton',
    'signature',
    'unknown',
  ]),
}) as unknown as z.ZodType<WidgetAnnotationDTO>;

export const WidgetDraftSchema: z.ZodType<WidgetDraft> = z.object({
  ...AnnotationDraftBaseShape,
  ...WidgetStyleDraftShape,
  subtype: z.literal('widget'),
  rect: PdfRectSchema,
}) as unknown as z.ZodType<WidgetDraft>;

export const WidgetPatchSchema: z.ZodType<WidgetPatch> = z.object({
  ...AnnotationPatchBaseShape,
  ...WidgetStylePatchShape,
  subtype: z.literal('widget'),
  rect: PdfRectSchema.optional(),
}) as unknown as z.ZodType<WidgetPatch>;
