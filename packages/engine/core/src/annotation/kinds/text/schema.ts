import { z } from 'zod';

import { PdfRectSchema } from '../../../geometry/schemas';
import {
  AnnotationBaseShape,
  AnnotationDraftBaseShape,
  AnnotationPatchBaseShape,
} from '../../base.schema';
import { ColorStyleDTOShape, ColorStyleDraftShape, ColorStylePatchShape } from '../style.shared';
import type { NoteIcon, TextDraft } from './draft';
import type { TextAnnotationDTO } from './dto';
import type { TextPatch } from './patch';

export const NoteIconSchema: z.ZodType<NoteIcon> = z.enum([
  'comment',
  'key',
  'note',
  'help',
  'new-paragraph',
  'paragraph',
  'insert',
]);

export const TextDTOSchema: z.ZodType<TextAnnotationDTO> = z.object({
  ...AnnotationBaseShape,
  ...ColorStyleDTOShape,
  icon: NoteIconSchema,
  // /State + /StateModel are open strings on the wire: the standard
  // review/marked vocabulary is normalized to lowercase, custom Acrobat
  // state models pass through verbatim.
  state: z.string().nullable(),
  stateModel: z.string().nullable(),
  subtype: z.literal('text'),
}) as unknown as z.ZodType<TextAnnotationDTO>;

export const TextDraftSchema: z.ZodType<TextDraft> = z.object({
  ...ColorStyleDraftShape,
  ...AnnotationDraftBaseShape,
  rect: PdfRectSchema,
  icon: NoteIconSchema.optional(),
  state: z.string().min(1).optional(),
  stateModel: z.string().min(1).optional(),
  subtype: z.literal('text'),
});

export const TextPatchSchema: z.ZodType<TextPatch> = z.object({
  ...ColorStylePatchShape,
  ...AnnotationPatchBaseShape,
  rect: PdfRectSchema.optional(),
  icon: NoteIconSchema.optional(),
  state: z.string().min(1).nullable().optional(),
  stateModel: z.string().min(1).nullable().optional(),
  subtype: z.literal('text'),
});
