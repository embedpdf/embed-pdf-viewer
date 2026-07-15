import { z } from 'zod';

import type {
  DocumentActionsSnapshot,
  PdfActionNode,
  PdfActionTree,
  PdfAnnotationActions,
  PdfFieldActions,
  PdfPageActions,
} from './PdfAction';

export const PdfActionTypeSchema = z.enum([
  'unknown',
  'goto',
  'goto-remote',
  'goto-embedded',
  'launch',
  'thread',
  'uri',
  'sound',
  'movie',
  'hide',
  'named',
  'submit-form',
  'reset-form',
  'import-data',
  'javascript',
  'set-ocg-state',
  'rendition',
  'transition',
  'goto-3d-view',
]);

export const PdfActionNodeSchema: z.ZodType<PdfActionNode> = z.lazy(() =>
  z.object({
    type: PdfActionTypeSchema,
    subtype: z.string(),
    script: z.string().optional(),
    next: z.array(PdfActionNodeSchema),
  }),
);

export const PdfActionTreeSchema: z.ZodType<PdfActionTree> = z.object({
  root: PdfActionNodeSchema.nullable(),
  incomplete: z.boolean(),
  warningFlags: z.number().int().nonnegative(),
  warnings: z.array(z.enum(['cycle-dropped', 'malformed-next', 'incomplete'])),
});

export const PdfFieldActionsSchema: z.ZodType<PdfFieldActions> = z.object({
  keystroke: PdfActionTreeSchema.optional(),
  format: PdfActionTreeSchema.optional(),
  validate: PdfActionTreeSchema.optional(),
  calculate: PdfActionTreeSchema.optional(),
});

export const PdfPageActionsSchema: z.ZodType<PdfPageActions> = z.object({
  open: PdfActionTreeSchema.optional(),
  close: PdfActionTreeSchema.optional(),
});

export const PdfAnnotationActionsSchema: z.ZodType<PdfAnnotationActions> = z.object({
  activate: PdfActionTreeSchema.optional(),
  cursorEnter: PdfActionTreeSchema.optional(),
  cursorExit: PdfActionTreeSchema.optional(),
  mouseDown: PdfActionTreeSchema.optional(),
  mouseUp: PdfActionTreeSchema.optional(),
  focus: PdfActionTreeSchema.optional(),
  blur: PdfActionTreeSchema.optional(),
  pageOpen: PdfActionTreeSchema.optional(),
  pageClose: PdfActionTreeSchema.optional(),
  pageVisible: PdfActionTreeSchema.optional(),
  pageInvisible: PdfActionTreeSchema.optional(),
});

export const DocumentActionsSnapshotSchema: z.ZodType<DocumentActionsSnapshot> = z.object({
  nameTreeScripts: z.array(
    z.object({
      name: z.string(),
      action: PdfActionTreeSchema,
    }),
  ),
  openAction: PdfActionTreeSchema.nullable(),
  willClose: PdfActionTreeSchema.optional(),
  willSave: PdfActionTreeSchema.optional(),
  didSave: PdfActionTreeSchema.optional(),
  willPrint: PdfActionTreeSchema.optional(),
  didPrint: PdfActionTreeSchema.optional(),
});
