import { z } from 'zod';

import { WidgetAppearanceSchema } from '../annotation/kinds/widget.shared';
import { PdfRectSchema } from '../geometry/schemas';
import type { FormFieldRef, FormWidgetRef } from '../identity/FormFieldRef';
import type { FormFieldDraft, FormFieldOptionInput, WidgetPlacement } from './draft';
import type { FormFieldPatch } from './patch';
import type { FormFieldDTO, FormFieldFlags, FormFieldOption, ToggleFieldWidget } from './field';
import type { FormKind, FormSnapshot } from './snapshot';
import type { FormDataFormat, FormFieldValue } from './value';
import type { FormValueEntry } from './value-entry';
import { PdfFieldActionsSchema } from '../dto/PdfAction.schema';

export const FormFieldRefSchema: z.ZodType<FormFieldRef> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('objectNumber'),
    fieldObjectNumber: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('fqn'),
    name: z.string().min(1),
  }),
]);

const FormWidgetRefShape = {
  // 0 = direct (unaddressable) widget / unplaced widget respectively.
  annotObjectNumber: z.number().int().nonnegative(),
  pageObjectNumber: z.number().int().nonnegative(),
};

export const FormWidgetRefSchema: z.ZodType<FormWidgetRef> = z.object(FormWidgetRefShape);

export const FormFieldFlagsSchema: z.ZodType<FormFieldFlags> = z.object({
  readOnly: z.boolean(),
  required: z.boolean(),
  noExport: z.boolean(),
  raw: z.number().int().nonnegative(),
});

export const ToggleFieldWidgetSchema: z.ZodType<ToggleFieldWidget> = z.object({
  ...FormWidgetRefShape,
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
  fieldObjectNumber: z.number().int().nonnegative(),
  name: z.string(),
  origin: z.enum(['acroform', 'recovered']),
  flags: FormFieldFlagsSchema,
  alternateName: z.string().nullable(),
  mappingName: z.string().nullable(),
  valueEntry: FormValueEntrySchema,
  defaultValueEntry: FormValueEntrySchema,
  actions: PdfFieldActionsSchema.optional(),
  widgets: z.array(FormWidgetRefSchema),
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
  calculationOrder: z.array(FormFieldRefSchema.nullable()),
});

export const FormFieldValueSchema: z.ZodType<FormFieldValue> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), value: z.string() }),
  z.object({ type: z.literal('toggle'), state: z.string().nullable() }),
  z.object({ type: z.literal('choice'), values: z.array(z.string()) }),
]);

export const FormDataFormatSchema: z.ZodType<FormDataFormat> = z.enum(['fdf', 'xfdf']);

export { WidgetAppearanceSchema };

export const WidgetPlacementSchema: z.ZodType<WidgetPlacement> = z.object({
  pageObjectNumber: z.number().int().positive(),
  rect: PdfRectSchema,
  onState: z.string().min(1).optional(),
  appearance: WidgetAppearanceSchema.optional(),
});

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
};

export const FormFieldDraftSchema: z.ZodType<FormFieldDraft> = z.discriminatedUnion('family', [
  z.object({
    ...FormFieldDraftBaseShape,
    family: z.literal('text'),
    defaultValue: z.string().optional(),
    maxLength: z.number().int().positive().optional(),
    multiline: z.boolean().optional(),
    password: z.boolean().optional(),
    comb: z.boolean().optional(),
    widget: WidgetPlacementSchema.optional(),
  }),
  z.object({
    ...FormFieldDraftBaseShape,
    family: z.literal('checkbox'),
    widget: WidgetPlacementSchema.optional(),
  }),
  z.object({
    ...FormFieldDraftBaseShape,
    family: z.literal('radio'),
    radiosInUnison: z.boolean().optional(),
    noToggleToOff: z.boolean().optional(),
    widgets: z.array(WidgetPlacementSchema).optional(),
  }),
  z.object({
    ...FormFieldDraftBaseShape,
    family: z.literal('combobox'),
    edit: z.boolean().optional(),
    options: z.array(FormFieldOptionInputSchema).optional(),
    defaultValue: z.string().optional(),
    widget: WidgetPlacementSchema.optional(),
  }),
  z.object({
    ...FormFieldDraftBaseShape,
    family: z.literal('listbox'),
    multiSelect: z.boolean().optional(),
    options: z.array(FormFieldOptionInputSchema).optional(),
    widget: WidgetPlacementSchema.optional(),
  }),
]) as unknown as z.ZodType<FormFieldDraft>;

const FormFieldPatchBaseShape = {
  name: z.string().min(1).optional(),
  readOnly: z.boolean().optional(),
  required: z.boolean().optional(),
  noExport: z.boolean().optional(),
  alternateName: z.string().nullable().optional(),
  mappingName: z.string().nullable().optional(),
};

export const FormFieldPatchSchema: z.ZodType<FormFieldPatch> = z.discriminatedUnion('family', [
  z.object({
    ...FormFieldPatchBaseShape,
    family: z.literal('text'),
    defaultValue: z.string().nullable().optional(),
    maxLength: z.number().int().positive().nullable().optional(),
    multiline: z.boolean().optional(),
    password: z.boolean().optional(),
    comb: z.boolean().optional(),
  }),
  z.object({
    ...FormFieldPatchBaseShape,
    family: z.literal('checkbox'),
  }),
  z.object({
    ...FormFieldPatchBaseShape,
    family: z.literal('radio'),
    radiosInUnison: z.boolean().optional(),
    noToggleToOff: z.boolean().optional(),
  }),
  z.object({
    ...FormFieldPatchBaseShape,
    family: z.literal('combobox'),
    edit: z.boolean().optional(),
    defaultValue: z.string().nullable().optional(),
    options: z.array(FormFieldOptionInputSchema).optional(),
  }),
  z.object({
    ...FormFieldPatchBaseShape,
    family: z.literal('listbox'),
    multiSelect: z.boolean().optional(),
    options: z.array(FormFieldOptionInputSchema).optional(),
  }),
]) as unknown as z.ZodType<FormFieldPatch>;
