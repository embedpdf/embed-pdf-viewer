import { FormFieldRefSchema } from '../identity/FormFieldRef.schema';
import { PageRefSchema } from '../identity/PageRef.schema';
import { AnnotationRefSchema } from '../annotation/base.schema';
import { z } from 'zod';

import { WidgetDTOSchema } from '../annotation/kinds/widget';
import { WIDGET_STYLE_SHAPE, WidgetAppearanceSchema } from '../annotation/kinds/widget.shared';
import { PageBoxSchema } from '../geometry/schemas';
import type { FormWidget } from '../identity/FormFieldRef';
import type { FormFieldDraft, FormFieldOptionInput, WidgetPlacement } from './draft';
import type { FormFieldPatch } from './patch';
import type { FormFieldDTO, FormFieldOption, FormFieldWidget, ToggleFieldWidget } from './field';
import type { FormKind, FormSnapshot } from './snapshot';
import type { FormDataFormat, FormFieldValue } from './value';
import type { FormValueEntry } from './value-entry';
import { IsoDateTimeSchema } from '../dto/IsoDateTime.schema';
import { PdfFieldActionsSchema } from '../dto/PdfAction.schema';

export { FormFieldRefSchema };

const FormWidgetShape = {
  // The annotation address, present exactly when the widget is indirect and placed.
  ref: AnnotationRefSchema.nullable(),
  // 0 = direct (unaddressable) widget; null page = unplaced widget.
  objectNumber: z.number().int().nonnegative(),
  page: PageRefSchema.nullable(),
};

export const FormWidgetSchema: z.ZodType<FormWidget> = z.object(FormWidgetShape);

export const FormFieldWidgetSchema: z.ZodType<FormFieldWidget> = FormWidgetSchema;

export const ToggleFieldWidgetSchema: z.ZodType<ToggleFieldWidget> = z.object({
  ...FormWidgetShape,
  onState: z.string(),
  exportValue: z.string(),
  checked: z.boolean(),
});

export const FormFieldOptionSchema: z.ZodType<FormFieldOption> = z.object({
  label: z.string(),
  value: z.string(),
  selected: z.boolean(),
});

export const FormValueEntrySchema: z.ZodType<FormValueEntry> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('scalar'), value: z.string() }),
  z.object({ kind: z.literal('array'), values: z.array(z.string()) }),
  z.object({ kind: z.literal('unsupported') }),
]);

const FormFieldBaseShape = {
  ref: FormFieldRefSchema,
  name: z.string(),
  origin: z.enum(['acroform', 'recovered']),
  readOnly: z.boolean(),
  required: z.boolean(),
  noExport: z.boolean(),
  alternateName: z.string().nullable(),
  mappingName: z.string().nullable(),
  valueEntry: FormValueEntrySchema,
  defaultValueEntry: FormValueEntrySchema,
  actions: PdfFieldActionsSchema.optional(),
  createdBy: z.string().nullable(),
  createdAt: IsoDateTimeSchema.nullable(),
  filledBy: z.string().nullable(),
  filledByName: z.string().nullable(),
  filledAt: IsoDateTimeSchema.nullable(),
  importedBy: z.string().nullable(),
  widgets: z.array(FormFieldWidgetSchema),
};

export const FormFieldDTOSchema: z.ZodType<FormFieldDTO> = z.discriminatedUnion('family', [
  z.object({
    ...FormFieldBaseShape,
    family: z.literal('text'),
    value: z.string(),
    defaultValue: z.string(),
    maxLength: z.number().int().positive().nullable(),
    multiline: z.boolean(),
    password: z.boolean(),
    comb: z.boolean(),
  }),
  z.object({
    ...FormFieldBaseShape,
    family: z.literal('checkbox'),
    checked: z.boolean(),
    exportValue: z.string(),
    widgets: z.array(ToggleFieldWidgetSchema),
  }),
  z.object({
    ...FormFieldBaseShape,
    family: z.literal('radio'),
    value: z.string(),
    radiosInUnison: z.boolean(),
    noToggleToOff: z.boolean(),
    widgets: z.array(ToggleFieldWidgetSchema),
  }),
  z.object({
    ...FormFieldBaseShape,
    family: z.literal('combobox'),
    value: z.string(),
    defaultValue: z.string(),
    edit: z.boolean(),
    options: z.array(FormFieldOptionSchema),
  }),
  z.object({
    ...FormFieldBaseShape,
    family: z.literal('listbox'),
    selectedValues: z.array(z.string()),
    defaultValue: z.array(z.string()),
    multiSelect: z.boolean(),
    options: z.array(FormFieldOptionSchema),
  }),
  z.object({
    ...FormFieldBaseShape,
    family: z.literal('pushbutton'),
  }),
  z.object({
    ...FormFieldBaseShape,
    family: z.literal('signature'),
  }),
  z.object({
    ...FormFieldBaseShape,
    family: z.literal('unknown'),
    rawValue: z.string(),
  }),
]) as unknown as z.ZodType<FormFieldDTO>;

export const FormKindSchema: z.ZodType<FormKind> = z.enum(['none', 'acroform', 'xfa']);

export const FormSnapshotSchema: z.ZodType<FormSnapshot> = z.object({
  formKind: FormKindSchema,
  needsAppearances: z.boolean(),
  fields: z.array(FormFieldDTOSchema),
  widgets: z.array(WidgetDTOSchema),
  calculationOrder: z.array(FormFieldRefSchema.nullable()),
}) as unknown as z.ZodType<FormSnapshot>;

/**
 * `{ value }`, `{ checked }` or `{ selectedValues }`: one object with exactly
 * one of the three, so the wire has no untagged union (the API reference
 * labels variants by a discriminating literal, and a value has none to add).
 */
export const FormFieldValueSchema: z.ZodType<FormFieldValue> = z
  .object({
    value: z.string().nullable().optional(),
    checked: z.boolean().optional(),
    selectedValues: z.array(z.string()).optional(),
  })
  .strict()
  .refine(
    (value) =>
      [value.value, value.checked, value.selectedValues].filter((set) => set !== undefined)
        .length === 1,
    { message: 'exactly one of value, checked or selectedValues' },
  ) as unknown as z.ZodType<FormFieldValue>;

export const FormDataFormatSchema: z.ZodType<FormDataFormat> = z.enum(['fdf', 'xfdf']);

export { WidgetAppearanceSchema };

export const WidgetPlacementSchema: z.ZodType<WidgetPlacement> = z
  .object({
    page: PageRefSchema,
    rect: PageBoxSchema,
    exportValue: z.string().min(1).optional(),
    ...WIDGET_STYLE_SHAPE,
  })
  .strict() as unknown as z.ZodType<WidgetPlacement>;

export const FormFieldOptionInputSchema: z.ZodType<FormFieldOptionInput> = z.object({
  label: z.string(),
  value: z.string(),
});

const FormFieldDraftBaseShape = {
  name: z.string().min(1),
  readOnly: z.boolean().optional(),
  required: z.boolean().optional(),
  noExport: z.boolean().optional(),
  alternateName: z.string().optional(),
  mappingName: z.string().optional(),
  widgets: z.array(WidgetPlacementSchema).optional(),
};

/** A draft that names a member its family doesn't have is refused, not trimmed. */
export const FormFieldDraftSchema: z.ZodType<FormFieldDraft> = z.discriminatedUnion('family', [
  z
    .object({
      ...FormFieldDraftBaseShape,
      family: z.literal('text'),
      defaultValue: z.string().optional(),
      maxLength: z.number().int().positive().optional(),
      multiline: z.boolean().optional(),
      password: z.boolean().optional(),
      comb: z.boolean().optional(),
    })
    .strict(),
  z.object({ ...FormFieldDraftBaseShape, family: z.literal('checkbox') }).strict(),
  z
    .object({
      ...FormFieldDraftBaseShape,
      family: z.literal('radio'),
      radiosInUnison: z.boolean().optional(),
      noToggleToOff: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ...FormFieldDraftBaseShape,
      family: z.literal('combobox'),
      edit: z.boolean().optional(),
      options: z.array(FormFieldOptionInputSchema).optional(),
      defaultValue: z.string().optional(),
    })
    .strict(),
  z
    .object({
      ...FormFieldDraftBaseShape,
      family: z.literal('listbox'),
      multiSelect: z.boolean().optional(),
      options: z.array(FormFieldOptionInputSchema).optional(),
      defaultValue: z.array(z.string()).optional(),
    })
    .strict(),
  z.object({ ...FormFieldDraftBaseShape, family: z.literal('signature') }).strict(),
]) as unknown as z.ZodType<FormFieldDraft>;

const FormFieldPatchBaseShape = {
  name: z.string().min(1).optional(),
  readOnly: z.boolean().optional(),
  required: z.boolean().optional(),
  noExport: z.boolean().optional(),
  alternateName: z.string().nullable().optional(),
  mappingName: z.string().nullable().optional(),
};

/**
 * One object on the wire: the family is optional (the engine knows it from
 * the ref), so there is no discriminator, and the engine refuses members
 * the field's family doesn't have.
 */
export const FormFieldPatchSchema: z.ZodType<FormFieldPatch> = z
  .object({
    ...FormFieldPatchBaseShape,
    family: z.enum(['text', 'checkbox', 'radio', 'combobox', 'listbox', 'signature']).optional(),
    // A string for text fields and dropdowns, option values for a list.
    defaultValue: z
      .union([z.string(), z.array(z.string())])
      .nullable()
      .optional(),
    maxLength: z.number().int().positive().nullable().optional(),
    multiline: z.boolean().optional(),
    password: z.boolean().optional(),
    comb: z.boolean().optional(),
    radiosInUnison: z.boolean().optional(),
    noToggleToOff: z.boolean().optional(),
    edit: z.boolean().optional(),
    multiSelect: z.boolean().optional(),
    options: z.array(FormFieldOptionInputSchema).optional(),
  })
  .strict() as unknown as z.ZodType<FormFieldPatch>;
