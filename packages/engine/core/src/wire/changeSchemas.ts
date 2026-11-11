import { z } from 'zod';

import {
  AnnotationCopyResultSchema,
  AnnotationCreateResultSchema,
  AnnotationDeleteResultSchema,
  AnnotationListMutationMetaSchema,
  AnnotationPositionSchema,
  AnnotationReorderResultSchema,
  AnnotationUpdateResultSchema,
  AttachmentCreateResultSchema,
  AttachmentDeleteResultSchema,
  AttachmentRestoreResultSchema,
  CustomMetadataPatchSchema,
  CustomMetadataUpdateResultSchema,
  EngineErrorSchema,
  FieldPositionSchema,
  FormCalculationsReorderResultSchema,
  FormCopyResultSchema,
  FormFieldCreateResultSchema,
  FormFieldDeleteResultSchema,
  FormFieldUpdateResultSchema,
  FormMutationMetaSchema,
  FormResetResultSchema,
  FormSetValueResultSchema,
  FormWidgetDeleteResultSchema,
  FormWidgetLinkResultSchema,
  FormWidgetRestoreResultSchema,
  FormWidgetsReorderResultSchema,
  FormWidgetUpdateResultSchema,
  MetadataPatchSchema,
  MetadataUpdateResultSchema,
  MutationMetaSchema,
  OutlineCreateResultSchema,
  OutlineDeleteResultSchema,
  OutlineMoveResultSchema,
  OutlinePositionSchema,
  OutlineRestoreResultSchema,
  OutlineUpdateResultSchema,
  PageDeleteResultSchema,
  PageInsertBlankSpecSchema,
  PageInsertResultSchema,
  PagePositionSchema,
  PageReorderResultSchema,
  PageRestoreResultSchema,
  PageRotateResultSchema,
  PageScaleResultSchema,
} from './schemas';
import { PdfMeasureSchema, PdfMeasureWriteSchema } from '../dto/Measure.schema';
import { AnnotationRefSchema } from '../annotation/base.schema';
import {
  AnnotationDraftSchema,
  AnnotationPatchSchema,
  AnnotationSchema,
} from '../annotation/kinds';
import { WidgetDTOSchema, WidgetPatchSchema } from '../annotation/kinds/widget';
import { AttachmentFileBaseSchema, AttachmentRefSchema } from '../dto/Attachment.schema';
import { OutlineItemDraftSchema, OutlineItemPatchSchema } from '../dto/DocumentOutline.schema';
import {
  FormFieldDraftSchema,
  FormFieldDTOSchema,
  FormFieldPatchSchema,
  FormFieldValueSchema,
  WidgetPlacementSchema,
} from '../forms/schema';
import { PdfRotationSchema } from '../geometry/schemas';
import { FormFieldRefSchema } from '../identity/FormFieldRef.schema';
import { OutlineItemRefSchema } from '../identity/OutlineItemRef.schema';
import { PageRefSchema } from '../identity/PageRef.schema';
import type { ChangeItemType } from '../mutation/Change';
import {
  AnnotationResourceKeysSchema,
  AppearanceResourceKeysSchema,
  FileResourceKeysSchema,
  SourceResourceKeysSchema,
} from './resourceKeys';
import { closed } from './reading';

/**
 * `POST /v1/docs/{docId}/layers/{layerName}/changes`: a request's changes and
 * their answers. A change's bytes (a stamp's drawing, an attached file, a
 * signature's artwork, a PDF whose pages come in) travel as multipart parts
 * beside the JSON (`resource:{key}`), which names them by key where the change
 * takes them.
 */

/** An op's id for its change: 1 to 255 visible ASCII characters, as `opId` always is. */
const OpIdSchema = z.string().regex(/^[\x21-\x7e]{1,255}$/);

const FormFieldDisplaySchema = z.enum(['visible', 'hidden', 'noPrint', 'noView']);

/**
 * One kind of op: its own fields and no others. A request is read strictly
 * (docs/conventions/api-evolution.md), so a field this server doesn't know
 * refuses the change rather than being dropped and the op applied without it.
 */
const op = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

/** One op of a change, as the request sends it. */
export const ChangeOpWireSchema = z.discriminatedUnion('type', [
  op({
    type: z.literal('annotations.create'),
    page: PageRefSchema,
    data: AnnotationDraftSchema,
    objectNumber: z.number().int().positive().optional(),
    resources: AnnotationResourceKeysSchema.optional(),
  }),
  op({
    type: z.literal('annotations.update'),
    ref: AnnotationRefSchema,
    patch: AnnotationPatchSchema,
    resources: AnnotationResourceKeysSchema.optional(),
    expect: AnnotationPatchSchema.optional(),
  }),
  op({
    type: z.literal('annotations.delete'),
    ref: AnnotationRefSchema,
    expect: AnnotationPatchSchema.optional(),
  }),
  op({
    type: z.literal('annotations.reorder'),
    page: PageRefSchema,
    refs: z.array(AnnotationRefSchema).min(1),
    position: AnnotationPositionSchema,
  }),
  op({
    type: z.literal('annotations.copy'),
    refs: z.array(AnnotationRefSchema).min(1),
    page: PageRefSchema.optional(),
    offset: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional(),
    objectNumbers: z.array(z.number().int().positive()).optional(),
  }),
  op({
    type: z.literal('forms.setValue'),
    field: FormFieldRefSchema,
    value: FormFieldValueSchema,
    expect: FormFieldValueSchema.optional(),
  }),
  op({
    type: z.literal('forms.setDisplay'),
    field: FormFieldRefSchema,
    display: FormFieldDisplaySchema,
  }),
  op({
    type: z.literal('forms.setAppearanceText'),
    field: FormFieldRefSchema,
    text: z.string(),
  }),
  op({
    type: z.literal('forms.reset'),
    fields: z.array(FormFieldRefSchema).optional(),
  }),
  op({
    type: z.literal('forms.create'),
    draft: FormFieldDraftSchema,
    objectNumber: z.number().int().positive().optional(),
    widgetObjectNumbers: z.array(z.number().int().positive()).optional(),
  }),
  op({
    type: z.literal('forms.copy'),
    fields: z.array(FormFieldRefSchema).min(1),
    widgets: z.array(AnnotationRefSchema).min(1).optional(),
    page: PageRefSchema.optional(),
    offset: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional(),
    values: z.boolean().optional(),
    objectNumbers: z.array(z.number().int().positive()).optional(),
  }),
  op({
    type: z.literal('forms.update'),
    field: FormFieldRefSchema,
    patch: FormFieldPatchSchema,
    expect: FormFieldPatchSchema.optional(),
  }),
  op({
    type: z.literal('forms.delete'),
    field: FormFieldRefSchema,
    expect: FormFieldPatchSchema.optional(),
  }),
  op({
    type: z.literal('forms.addWidget'),
    field: FormFieldRefSchema,
    placement: WidgetPlacementSchema,
    objectNumber: z.number().int().positive().optional(),
    splitObjectNumber: z.number().int().positive().optional(),
  }),
  op({
    type: z.literal('forms.removeWidget'),
    field: FormFieldRefSchema,
    widget: AnnotationRefSchema,
  }),
  op({
    type: z.literal('forms.deleteWidget'),
    widget: AnnotationRefSchema,
    expect: WidgetPatchSchema.optional(),
  }),
  op({
    type: z.literal('forms.reorderCalculations'),
    fields: z.array(FormFieldRefSchema).min(1),
    position: FieldPositionSchema,
  }),
  op({
    type: z.literal('forms.reorderWidgets'),
    page: PageRefSchema,
    widgets: z.array(AnnotationRefSchema).min(1),
    position: AnnotationPositionSchema,
  }),
  op({
    type: z.literal('forms.updateWidget'),
    widget: AnnotationRefSchema,
    patch: WidgetPatchSchema,
    expect: WidgetPatchSchema.optional(),
  }),
  op({
    type: z.literal('forms.setSignatureAppearance'),
    field: FormFieldRefSchema,
    /** The one-page PDF drawn in, as the key of its multipart part. */
    resources: AppearanceResourceKeysSchema,
  }),
  op({
    type: z.literal('metadata.update'),
    patch: MetadataPatchSchema,
    expect: MetadataPatchSchema.optional(),
  }),
  op({
    type: z.literal('metadata.updateCustom'),
    patch: CustomMetadataPatchSchema,
  }),
  op({
    type: z.literal('outline.create'),
    parent: OutlineItemRefSchema.nullable(),
    position: OutlinePositionSchema.optional(),
    data: OutlineItemDraftSchema,
    objectNumber: z.number().int().positive().optional(),
  }),
  op({
    type: z.literal('outline.update'),
    ref: OutlineItemRefSchema,
    patch: OutlineItemPatchSchema,
    expect: OutlineItemPatchSchema.optional(),
  }),
  op({
    type: z.literal('outline.move'),
    refs: z.array(OutlineItemRefSchema).min(1),
    parent: OutlineItemRefSchema.nullable(),
    position: OutlinePositionSchema,
  }),
  op({
    type: z.literal('outline.delete'),
    ref: OutlineItemRefSchema,
    expect: OutlineItemPatchSchema.optional(),
  }),
  op({
    type: z.literal('pages.rotate'),
    pages: z.array(PageRefSchema).min(1),
    rotation: PdfRotationSchema,
  }),
  op({
    type: z.literal('pages.setScale'),
    pages: z.array(PageRefSchema).min(1),
    measure: PdfMeasureWriteSchema.nullable(),
  }),
  op({
    type: z.literal('pages.reorder'),
    pages: z.array(PageRefSchema).min(1),
    position: PagePositionSchema,
  }),
  op({
    type: z.literal('pages.delete'),
    pages: z.array(PageRefSchema).min(1),
  }),
  op({
    type: z.literal('pages.insertBlank'),
    spec: PageInsertBlankSpecSchema,
    position: PagePositionSchema.optional(),
    objectNumbers: z.array(z.number().int().positive()).optional(),
  }),
  op({
    type: z.literal('pages.insert'),
    /** The PDF whose pages come in, as the key of its multipart part. */
    resources: SourceResourceKeysSchema,
    position: PagePositionSchema.optional(),
    objectNumbers: z.array(z.number().int().positive()).optional(),
  }),
  op({
    type: z.literal('pages.copy'),
    pages: z.array(PageRefSchema).min(1),
    position: PagePositionSchema.optional(),
    objectNumbers: z.array(z.number().int().positive()).optional(),
  }),
  op({
    type: z.literal('attachments.create'),
    file: AttachmentFileBaseSchema,
    /** The file's bytes, as the key of their multipart part. */
    resources: FileResourceKeysSchema,
  }),
  op({
    type: z.literal('attachments.delete'),
    ref: AttachmentRefSchema,
  }),
]);

/**
 * One change of a request: its `ops`, or `undoOf`, the undo of an earlier
 * change. One object with exactly one of the two, so the wire has no untagged
 * union (the API reference labels variants by a discriminating literal).
 */
export const ChangeEntryWireSchema = z
  .object({
    opId: OpIdSchema,
    ops: z.array(ChangeOpWireSchema).optional(),
    undoOf: OpIdSchema.optional(),
  })
  .strict()
  .refine((entry) => (entry.ops === undefined) !== (entry.undoOf === undefined), {
    message: 'exactly one of ops or undoOf',
  });

/** What a request may hold. */
export const CHANGE_REQUEST_LIMITS = {
  /** Changes per request. */
  changes: 64,
  /** Ops per change. */
  ops: 512,
} as const;

/** A `POST …/changes` body: the changes, applied in order, each on its own. */
export const ChangeRequestSchema = z.object({
  changes: z.array(ChangeEntryWireSchema).min(1).max(CHANGE_REQUEST_LIMITS.changes),
});

/** What an item can be: an op's type, or a restore (only in an undo). */
const ChangeItemTypeSchema = closed(
  z.enum([
    ...ChangeOpWireSchema.options.map((option) => option.shape.type.value),
    'annotations.restore',
    'forms.restore',
    'forms.restoreWidget',
    'outline.restore',
    'pages.restore',
    'attachments.restore',
  ] as unknown as [ChangeItemType, ...ChangeItemType[]]),
);

/** Every kind of change op and result item this build has: an op's type, or a restore. */
export const CHANGE_KINDS: readonly string[] = ChangeItemTypeSchema.options;

/** What an undo left alone, by name. */
const SkippedFieldsSchema = z.array(z.string()).optional();

/** An item of `type`: its verb's result, after the type and what else the item adds. */
function itemOf<T extends ChangeItemType>(
  type: T,
  result: z.ZodTypeAny,
  extra: z.ZodRawShape = {},
) {
  return z.object({ type: z.literal(type), ...extra }).merge(result as z.AnyZodObject);
}

/**
 * One item of a change's result: what one op did, or that an undo left it
 * alone (`skipped`). Every item names itself by `type`.
 */
export const ChangeItemSchema = closed(
  z.union([
    z.object({
      type: z.literal('skipped'),
      /** The item it would have been. */
      op: ChangeItemTypeSchema,
      meta: MutationMetaSchema,
    }),
    itemOf('annotations.create', AnnotationCreateResultSchema, { page: PageRefSchema }),
    itemOf('annotations.update', AnnotationUpdateResultSchema, {
      page: PageRefSchema,
      skipped: SkippedFieldsSchema,
    }),
    itemOf('annotations.delete', AnnotationDeleteResultSchema, { page: PageRefSchema }),
    itemOf('annotations.reorder', AnnotationReorderResultSchema, { page: PageRefSchema }),
    itemOf('annotations.copy', AnnotationCopyResultSchema),
    z.object({
      type: z.literal('annotations.restore'),
      page: PageRefSchema,
      annotations: z.array(AnnotationSchema),
      meta: AnnotationListMutationMetaSchema,
    }),
    itemOf('forms.setValue', FormSetValueResultSchema),
    itemOf('forms.setDisplay', FormFieldUpdateResultSchema),
    itemOf('forms.setAppearanceText', FormFieldUpdateResultSchema),
    itemOf('forms.reset', FormResetResultSchema, { skipped: SkippedFieldsSchema }),
    itemOf('forms.create', FormFieldCreateResultSchema),
    itemOf('forms.copy', FormCopyResultSchema),
    itemOf('forms.update', FormFieldUpdateResultSchema, { skipped: SkippedFieldsSchema }),
    itemOf('forms.delete', FormFieldDeleteResultSchema),
    z.object({
      type: z.literal('forms.restore'),
      field: FormFieldDTOSchema,
      widgets: z.array(WidgetDTOSchema),
      meta: FormMutationMetaSchema,
    }),
    itemOf('forms.setSignatureAppearance', FormFieldUpdateResultSchema),
    itemOf('forms.addWidget', FormWidgetLinkResultSchema),
    itemOf('forms.removeWidget', FormWidgetLinkResultSchema),
    itemOf('forms.deleteWidget', FormWidgetDeleteResultSchema),
    itemOf('forms.restoreWidget', FormWidgetRestoreResultSchema),
    itemOf('forms.reorderWidgets', FormWidgetsReorderResultSchema),
    itemOf('forms.reorderCalculations', FormCalculationsReorderResultSchema),
    itemOf('forms.updateWidget', FormWidgetUpdateResultSchema, { skipped: SkippedFieldsSchema }),
    itemOf('metadata.update', MetadataUpdateResultSchema, { skipped: SkippedFieldsSchema }),
    itemOf('metadata.updateCustom', CustomMetadataUpdateResultSchema, {
      skipped: SkippedFieldsSchema,
    }),
    itemOf('outline.create', OutlineCreateResultSchema),
    itemOf('outline.update', OutlineUpdateResultSchema, { skipped: SkippedFieldsSchema }),
    itemOf('outline.move', OutlineMoveResultSchema),
    itemOf('outline.delete', OutlineDeleteResultSchema),
    itemOf('outline.restore', OutlineRestoreResultSchema),
    itemOf('pages.rotate', PageRotateResultSchema, {
      pages: z.array(PageRefSchema),
      rotation: PdfRotationSchema,
    }),
    itemOf('pages.setScale', PageScaleResultSchema, {
      pages: z.array(PageRefSchema),
      measure: PdfMeasureSchema.nullable(),
    }),
    itemOf('pages.reorder', PageReorderResultSchema),
    itemOf('pages.delete', PageDeleteResultSchema, { pages: z.array(PageRefSchema) }),
    itemOf('pages.insertBlank', PageInsertResultSchema),
    itemOf('pages.insert', PageInsertResultSchema),
    itemOf('pages.copy', PageInsertResultSchema),
    itemOf('pages.restore', PageRestoreResultSchema),
    itemOf('attachments.create', AttachmentCreateResultSchema),
    itemOf('attachments.delete', AttachmentDeleteResultSchema),
    itemOf('attachments.restore', AttachmentRestoreResultSchema),
  ]),
);

/** What a change did: one item per op (per step of an undo), and its meta. */
export const ChangeResultSchema = z.object({
  items: z.array(ChangeItemSchema),
  meta: MutationMetaSchema,
});

/** One change's answer: applied with its result, or refused with the error. */
export const ChangeAnswerSchema = closed(
  z.discriminatedUnion('status', [
    z.object({ opId: z.string(), status: z.literal('applied'), result: ChangeResultSchema }),
    z.object({ opId: z.string(), status: z.literal('refused'), error: EngineErrorSchema }),
  ]),
);

/** A `POST …/changes` response: one answer per change, in order. */
export const ChangeResponseSchema = z.object({ changes: z.array(ChangeAnswerSchema) });

/**
 * Stable public component names for the change wire model, so an OpenAPI
 * projection names an op, an item and a result once, like
 * `AnnotationWireComponents`.
 */
export const ChangeWireComponents = {
  ChangeOp: ChangeOpWireSchema,
  ChangeItem: ChangeItemSchema,
  ChangeResult: ChangeResultSchema,
} as const satisfies Record<string, z.ZodTypeAny>;
