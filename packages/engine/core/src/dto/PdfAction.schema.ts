import { z } from 'zod';

import type {
  DocumentActionsSnapshot,
  PdfActionNode,
  PdfActionTargetRef,
  PdfActionTree,
  PdfActionType,
} from './PdfAction';
import { PdfDestinationSchema } from './PdfDestination.schema';

export const PdfActionTargetRefSchema: z.ZodType<PdfActionTargetRef> = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('name'), name: z.string() }),
    z.object({ kind: z.literal('objectNumber'), objectNumber: z.number().int().positive() }),
  ],
) as unknown as z.ZodType<PdfActionTargetRef>;

/** Fields every node arm repeats — zod 3's discriminatedUnion needs plain
 *  object options, so the recursion (`next`) lives inline per arm and the
 *  whole union sits behind one `z.lazy`. */
const nodeCommon = {
  subtype: z.string(),
  next: z.array(z.lazy(() => PdfActionNodeSchema)),
};

const arm = <T extends string>(type: T, shape: z.ZodRawShape = {}) =>
  z.object({ type: z.literal(type), ...nodeCommon, ...shape });

const PDF_ACTION_NODE_ARMS = [
  arm('javascript', { script: z.string() }),
  arm('goto', { destination: PdfDestinationSchema }),
  arm('uri', { uri: z.string(), isMap: z.boolean() }),
  arm('named', { name: z.string() }),
  arm('hide', { targets: z.array(PdfActionTargetRefSchema), hide: z.boolean() }),
  arm('reset-form', {
    fields: z.array(PdfActionTargetRefSchema).nullable(),
    exclude: z.boolean(),
  }),
  arm('goto-remote', { filePath: z.string() }),
  arm('goto-embedded', { filePath: z.string() }),
  arm('launch', { filePath: z.string() }),
  arm('rendition', { script: z.string().optional() }),
  arm('submit-form'),
  arm('thread'),
  arm('sound'),
  arm('movie'),
  arm('import-data'),
  arm('set-ocg-state'),
  arm('transition'),
  arm('goto-3d-view'),
  arm('unknown'),
] as const;

export const PdfActionNodeSchema: z.ZodType<PdfActionNode> = z.lazy(
  () =>
    z.discriminatedUnion('type', [
      ...PDF_ACTION_NODE_ARMS,
    ]) as unknown as z.ZodType<PdfActionNode>,
);

/** The `/S` vocabulary, derived from the union arms so it cannot drift. */
export const PdfActionTypeSchema: z.ZodType<PdfActionType> = z.enum(
  PDF_ACTION_NODE_ARMS.map((option) => option.shape.type.value) as [
    PdfActionType,
    ...PdfActionType[],
  ],
) as unknown as z.ZodType<PdfActionType>;

export const PdfActionTreeSchema: z.ZodType<PdfActionTree> = z.object({
  root: PdfActionNodeSchema.nullable(),
  incomplete: z.boolean(),
  warningFlags: z.number().int().nonnegative(),
  warnings: z.array(
    z.enum(['cycle-dropped', 'malformed-next', 'incomplete', 'payload-dropped']),
  ),
});

export const PdfFieldActionsSchema = z.object({
  keystroke: PdfActionTreeSchema.optional(),
  format: PdfActionTreeSchema.optional(),
  validate: PdfActionTreeSchema.optional(),
  calculate: PdfActionTreeSchema.optional(),
});

export const PdfPageActionsSchema = z.object({
  open: PdfActionTreeSchema.optional(),
  close: PdfActionTreeSchema.optional(),
});

export const PdfAnnotationActionsSchema = z.object({
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

export const DocumentActionsSnapshotSchema: z.ZodType<DocumentActionsSnapshot> = z
  .object({
    nameTreeScripts: z.array(
      z.object({
        name: z.string(),
        action: PdfActionTreeSchema,
      }),
    ),
    openAction: PdfActionTreeSchema.nullable(),
    // Defaulted so a pre-payload server response (field absent) still parses
    // and every parsed snapshot carries the key.
    openDestination: PdfDestinationSchema.nullable().default(null),
    willClose: PdfActionTreeSchema.optional(),
    willSave: PdfActionTreeSchema.optional(),
    didSave: PdfActionTreeSchema.optional(),
    willPrint: PdfActionTreeSchema.optional(),
    didPrint: PdfActionTreeSchema.optional(),
  })
  .superRefine((snapshot, context) => {
    // `/OpenAction` is ONE catalog entry — a dictionary (action) or an array
    // (destination). Both non-null cannot come from a correct reader.
    if (snapshot.openAction !== null && (snapshot.openDestination ?? null) !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'openAction and openDestination are mutually exclusive',
        path: ['openDestination'],
      });
    }
  }) as unknown as z.ZodType<DocumentActionsSnapshot>;
