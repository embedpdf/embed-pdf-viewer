import { z } from 'zod';

import type {
  DocumentActionsSnapshot,
  FieldActionsPatch,
  FieldScriptWrite,
  PdfActionNode,
  PdfActionTargetRef,
  PdfActionTree,
  PdfActionType,
} from './PdfAction';
import { PageDestinationSchema, PdfDestinationSchema } from './PdfDestination.schema';

export const PdfActionTargetRefSchema: z.ZodType<PdfActionTargetRef> = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('name'), name: z.string() }),
    z.object({ kind: z.literal('objectNumber'), objectNumber: z.number().int().positive() }),
  ],
) as unknown as z.ZodType<PdfActionTargetRef>;

const SubmitFormFlagsSchema = z.object({
  raw: z.number().int().nonnegative(),
  exclude: z.boolean(),
  includeNoValueFields: z.boolean(),
  format: z.enum(['fdf', 'html', 'xfdf', 'pdf']),
  method: z.enum(['post', 'get']),
  submitCoordinates: z.boolean(),
  includeAppendSaves: z.boolean(),
  includeAnnotations: z.boolean(),
  canonicalFormat: z.boolean(),
  exclNonUserAnnots: z.boolean(),
  exclFKey: z.boolean(),
  embedForm: z.boolean(),
});

/**
 * The action schemas for one kind of destination: in the file's coordinates
 * or in page space. Everything but a `goto`'s destination is the same.
 */
function actionSchemasFor<Destination>(destination: z.ZodType<Destination>) {
  /** Fields every node arm repeats — zod 3's discriminatedUnion needs plain
   *  object options, so the recursion (`next`) lives inline per arm and the
   *  whole union sits behind one `z.lazy`. */
  const nodeCommon = {
    subtype: z.string(),
    next: z.array(z.lazy(() => node)),
  };
  const arm = <T extends string>(type: T, shape: z.ZodRawShape = {}) =>
    z.object({ type: z.literal(type), ...nodeCommon, ...shape });
  const arms = [
    arm('javascript', { script: z.string() }),
    arm('goto', { destination }),
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
    arm('submit-form', {
      // Optional as a whole and complete when present — the atomic-payload
      // law; a pre-payload producer (older runtime/server) omits the key.
      payload: z
        .object({
          url: z.string(),
          fields: z.array(PdfActionTargetRefSchema).nullable(),
          flags: SubmitFormFlagsSchema,
          charSet: z.string().optional(),
        })
        .optional(),
    }),
    arm('thread'),
    arm('sound'),
    arm('movie'),
    arm('import-data'),
    arm('set-ocg-state'),
    arm('transition'),
    arm('goto-3d-view'),
    arm('unknown'),
  ] as const;
  const node: z.ZodType<PdfActionNode<Destination>> = z.lazy(
    () =>
      z.discriminatedUnion('type', [...arms]) as unknown as z.ZodType<PdfActionNode<Destination>>,
  );
  const tree: z.ZodType<PdfActionTree<Destination>> = z.object({
    root: node.nullable(),
    incomplete: z.boolean(),
    warningFlags: z.number().int().nonnegative(),
    warnings: z.array(z.enum(['cycle-dropped', 'malformed-next', 'incomplete', 'payload-dropped'])),
  });
  const fieldActions = z.object({
    keystroke: tree.optional(),
    format: tree.optional(),
    validate: tree.optional(),
    calculate: tree.optional(),
  });
  const pageActions = z.object({
    open: tree.optional(),
    close: tree.optional(),
  });
  const annotationActions = z.object({
    activate: tree.optional(),
    cursorEnter: tree.optional(),
    cursorExit: tree.optional(),
    mouseDown: tree.optional(),
    mouseUp: tree.optional(),
    focus: tree.optional(),
    blur: tree.optional(),
    pageOpen: tree.optional(),
    pageClose: tree.optional(),
    pageVisible: tree.optional(),
    pageInvisible: tree.optional(),
  });
  const documentActions = z
    .object({
      nameTreeScripts: z.array(z.object({ name: z.string(), action: tree })),
      openAction: tree.nullable(),
      // Defaulted so a pre-payload server response (field absent) still parses
      // and every parsed snapshot carries the key.
      openDestination: destination.nullable().default(null),
      willClose: tree.optional(),
      willSave: tree.optional(),
      didSave: tree.optional(),
      willPrint: tree.optional(),
      didPrint: tree.optional(),
    })
    .superRefine((snapshot, context) => {
      // `/OpenAction` is one catalog entry — a dictionary (action) or an array
      // (destination). Both non-null cannot come from a correct reader.
      if (snapshot.openAction !== null && (snapshot.openDestination ?? null) !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'openAction and openDestination are mutually exclusive',
          path: ['openDestination'],
        });
      }
    }) as unknown as z.ZodType<DocumentActionsSnapshot<Destination>>;
  return { arms, node, tree, fieldActions, pageActions, annotationActions, documentActions };
}

const PAGE_SPACE = actionSchemasFor(PageDestinationSchema);
const PDF_SPACE = actionSchemasFor(PdfDestinationSchema);

export const PdfActionNodeSchema: z.ZodType<PdfActionNode> = PAGE_SPACE.node;

/** The `/S` vocabulary, derived from the union arms so it cannot drift. */
export const PdfActionTypeSchema: z.ZodType<PdfActionType> = z.enum(
  PAGE_SPACE.arms.map((option) => option.shape.type.value) as [PdfActionType, ...PdfActionType[]],
) as unknown as z.ZodType<PdfActionType>;

export const PdfActionTreeSchema: z.ZodType<PdfActionTree> = PAGE_SPACE.tree;
export const PdfFieldActionsSchema = PAGE_SPACE.fieldActions;
export const PdfPageActionsSchema = PAGE_SPACE.pageActions;
export const DocumentActionsSnapshotSchema: z.ZodType<DocumentActionsSnapshot> =
  PAGE_SPACE.documentActions;

/** An annotation's actions (`/A`, `/AA`), their destinations in page space. */
export const PdfAnnotationActionsSchema = PAGE_SPACE.annotationActions;

/** An annotation's actions as the engine reads the file: destinations in the file's coordinates. */
export const FileAnnotationActionsSchema = PDF_SPACE.annotationActions;

/**
 * A field event's script: JavaScript all through. Any other action type is
 * refused here, at the boundary.
 */
export const FieldScriptWriteSchema: z.ZodType<FieldScriptWrite> = z.lazy(() =>
  z.object({
    type: z.literal('javascript'),
    script: z.string(),
    next: z.array(FieldScriptWriteSchema).optional(),
  }),
);

/** A field's scripts to write, by event: a script sets one, `null` removes it. */
export const FieldActionsPatchSchema: z.ZodType<FieldActionsPatch> = z.object({
  keystroke: FieldScriptWriteSchema.nullable().optional(),
  format: FieldScriptWriteSchema.nullable().optional(),
  validate: FieldScriptWriteSchema.nullable().optional(),
  calculate: FieldScriptWriteSchema.nullable().optional(),
});

/**
 * Stable public component names for generators that project the action wire
 * model into OpenAPI or another schema format. Keep reusable boundaries here;
 * individual action arms remain owned by `PdfActionNodeSchema`.
 */
export const PdfActionWireComponents = {
  PdfActionTargetRef: PdfActionTargetRefSchema,
  PageDestination: PageDestinationSchema,
  PdfActionNode: PdfActionNodeSchema,
  PdfActionTree: PdfActionTreeSchema,
  PdfFieldActions: PdfFieldActionsSchema,
  PdfPageActions: PdfPageActionsSchema,
  PdfAnnotationActions: PdfAnnotationActionsSchema,
  DocumentActionsSnapshot: DocumentActionsSnapshotSchema,
  FieldScriptWrite: FieldScriptWriteSchema,
  FieldActionsPatch: FieldActionsPatchSchema,
} as const satisfies Record<string, z.ZodTypeAny>;
