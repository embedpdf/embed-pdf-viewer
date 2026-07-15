import type {
  FormFieldBase,
  FormFieldDTO,
  FormFieldFamily,
  FormFieldOption,
  FormKind,
  FormSnapshot,
  FormWidgetRef,
  ToggleFieldWidget,
  FormValueEntry,
  PdfFieldActions,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/pdf-runtime';

import { readUtf16String, readUtf8String } from '../../../runtime/memory/strings';
import { ActionReadBudgetTracker, readActionModel } from '../../actions/ActionModelReader';

// Mirrors EPDF_FORMFIELD_FAMILY_* in public/epdf_form.h.
export const FAMILY_BY_CODE: Record<number, FormFieldFamily> = {
  0: 'unknown',
  1: 'pushbutton',
  2: 'checkbox',
  3: 'radio',
  4: 'text',
  5: 'combobox',
  6: 'listbox',
  7: 'signature',
};

// Mirrors EPDF_FORMKIND_* in public/epdf_form.h.
const FORM_KIND_BY_CODE: Record<number, FormKind> = {
  0: 'none',
  1: 'acroform',
  2: 'xfa',
};

// PDF /Ff bits (1-based bit numbers per ISO 32000 Table 226/228/230).
const FF_READ_ONLY = 1 << 0;
const FF_REQUIRED = 1 << 1;
const FF_NO_EXPORT = 1 << 2;
const FF_MULTILINE = 1 << 12;
const FF_PASSWORD = 1 << 13;
const FF_NO_TOGGLE_TO_OFF = 1 << 14;
const FF_EDIT = 1 << 18;
const FF_MULTI_SELECT = 1 << 21;
const FF_COMB = 1 << 24;
const FF_RADIOS_IN_UNISON = 1 << 25;

function readWide(runtime: PdfRuntimeModule, call: (buf: Ptr, capacity: number) => number): string {
  return readUtf16String(runtime.mem, call) ?? '';
}

function readWideOrNull(
  runtime: PdfRuntimeModule,
  call: (buf: Ptr, capacity: number) => number,
): string | null {
  return readUtf16String(runtime.mem, call, null);
}

function readToggleWidgets(
  runtime: PdfRuntimeModule,
  model: Ptr,
  fieldIndex: number,
): ToggleFieldWidget[] {
  const { fn } = runtime;
  const count = fn.EPDFForm_CountFieldWidgets(model, fieldIndex);
  const widgets: ToggleFieldWidget[] = [];
  for (let w = 0; w < count; w++) {
    widgets.push({
      annotObjectNumber: fn.EPDFForm_GetFieldWidgetObjNum(model, fieldIndex, w),
      pageObjectNumber: fn.EPDFForm_GetFieldWidgetPageObjNum(model, fieldIndex, w),
      onState:
        readUtf8String(runtime.mem, (buf, cap) =>
          fn.EPDFForm_GetFieldWidgetOnState(model, fieldIndex, w, buf, cap),
        ) ?? '',
      exportValue: readWide(runtime, (buf, cap) =>
        fn.EPDFForm_GetFieldWidgetExportValue(model, fieldIndex, w, buf, cap),
      ),
      checked: fn.EPDFForm_IsFieldWidgetChecked(model, fieldIndex, w),
    });
  }
  return widgets;
}

function readPlainWidgets(
  runtime: PdfRuntimeModule,
  model: Ptr,
  fieldIndex: number,
): FormWidgetRef[] {
  const { fn } = runtime;
  const count = fn.EPDFForm_CountFieldWidgets(model, fieldIndex);
  const widgets: FormWidgetRef[] = [];
  for (let w = 0; w < count; w++) {
    widgets.push({
      annotObjectNumber: fn.EPDFForm_GetFieldWidgetObjNum(model, fieldIndex, w),
      pageObjectNumber: fn.EPDFForm_GetFieldWidgetPageObjNum(model, fieldIndex, w),
    });
  }
  return widgets;
}

function readOptions(runtime: PdfRuntimeModule, model: Ptr, fieldIndex: number): FormFieldOption[] {
  const { fn } = runtime;
  const count = fn.EPDFForm_CountFieldOptions(model, fieldIndex);
  const options: FormFieldOption[] = [];
  for (let o = 0; o < count; o++) {
    options.push({
      label: readWide(runtime, (buf, cap) =>
        fn.EPDFForm_GetFieldOptionLabel(model, fieldIndex, o, buf, cap),
      ),
      value: readWide(runtime, (buf, cap) =>
        fn.EPDFForm_GetFieldOptionValue(model, fieldIndex, o, buf, cap),
      ),
      selected: fn.EPDFForm_IsFieldOptionSelected(model, fieldIndex, o),
    });
  }
  return options;
}

/** Read one field of the native model into its per-family DTO. */
export function readFieldAt(
  runtime: PdfRuntimeModule,
  model: Ptr,
  fieldIndex: number,
  actionBudget = new ActionReadBudgetTracker(),
): FormFieldDTO {
  const { fn } = runtime;
  const fieldObjectNumber = fn.EPDFForm_GetFieldObjNum(model, fieldIndex);
  const name = readWide(runtime, (buf, cap) =>
    fn.EPDFForm_GetFieldName(model, fieldIndex, buf, cap),
  );
  const rawFlags = fn.EPDFForm_GetFieldFlags(model, fieldIndex);
  const family = FAMILY_BY_CODE[fn.EPDFForm_GetFieldFamily(model, fieldIndex)] ?? 'unknown';
  const valueEntry = readValueEntry(runtime, model, fieldIndex, false);
  const defaultValueEntry = readValueEntry(runtime, model, fieldIndex, true);
  const actions = readFieldActions(runtime, model, fieldIndex, actionBudget);

  const base: FormFieldBase = {
    ref:
      fieldObjectNumber > 0 ? { kind: 'objectNumber', fieldObjectNumber } : { kind: 'fqn', name },
    fieldObjectNumber,
    name,
    family,
    origin: fn.EPDFForm_GetFieldOrigin(model, fieldIndex) === 1 ? 'recovered' : 'acroform',
    flags: {
      readOnly: (rawFlags & FF_READ_ONLY) !== 0,
      required: (rawFlags & FF_REQUIRED) !== 0,
      noExport: (rawFlags & FF_NO_EXPORT) !== 0,
      raw: rawFlags,
    },
    alternateName: readWideOrNull(runtime, (buf, cap) =>
      fn.EPDFForm_GetFieldAlternateName(model, fieldIndex, buf, cap),
    ),
    mappingName: readWideOrNull(runtime, (buf, cap) =>
      fn.EPDFForm_GetFieldMappingName(model, fieldIndex, buf, cap),
    ),
    valueEntry,
    defaultValueEntry,
    ...(actions ? { actions } : {}),
    widgets: [],
  };
  const scalarValue = entryScalar(valueEntry);
  const scalarDefault = entryScalar(defaultValueEntry);

  switch (family) {
    case 'text': {
      const maxLen = fn.EPDFForm_GetFieldMaxLen(model, fieldIndex);
      return {
        ...base,
        family,
        value: scalarValue,
        defaultValue: scalarDefault,
        maxLength: maxLen > 0 ? maxLen : null,
        multiline: (rawFlags & FF_MULTILINE) !== 0,
        password: (rawFlags & FF_PASSWORD) !== 0,
        comb: (rawFlags & FF_COMB) !== 0,
        widgets: readPlainWidgets(runtime, model, fieldIndex),
      };
    }
    case 'checkbox': {
      const widgets = readToggleWidgets(runtime, model, fieldIndex);
      return {
        ...base,
        family,
        checked: widgets.some((w) => w.checked),
        exportValue: widgets[0]?.exportValue ?? 'Yes',
        widgets,
      };
    }
    case 'radio': {
      const widgets = readToggleWidgets(runtime, model, fieldIndex);
      return {
        ...base,
        family,
        value: widgets.find((widget) => widget.checked)?.exportValue ?? 'Off',
        radiosInUnison: (rawFlags & FF_RADIOS_IN_UNISON) !== 0,
        noToggleToOff: (rawFlags & FF_NO_TOGGLE_TO_OFF) !== 0,
        widgets,
      };
    }
    case 'combobox': {
      return {
        ...base,
        family,
        value: scalarValue,
        defaultValue: scalarDefault,
        edit: (rawFlags & FF_EDIT) !== 0,
        options: readOptions(runtime, model, fieldIndex),
        widgets: readPlainWidgets(runtime, model, fieldIndex),
      };
    }
    case 'listbox': {
      const options = readOptions(runtime, model, fieldIndex);
      return {
        ...base,
        family,
        selectedValues: options.filter((o) => o.selected).map((o) => o.value),
        multiSelect: (rawFlags & FF_MULTI_SELECT) !== 0,
        options,
        widgets: readPlainWidgets(runtime, model, fieldIndex),
      };
    }
    case 'pushbutton':
    case 'signature': {
      return { ...base, family, widgets: readPlainWidgets(runtime, model, fieldIndex) };
    }
    default: {
      return {
        ...base,
        family: 'unknown',
        rawValue:
          valueEntry.kind === 'array' ? valueEntry.values.join(',') : entryScalar(valueEntry),
        widgets: readPlainWidgets(runtime, model, fieldIndex),
      };
    }
  }
}

/** Read the whole native model into a detached {@link FormSnapshot}. */
export function readFormSnapshot(runtime: PdfRuntimeModule, model: Ptr): FormSnapshot {
  const { fn } = runtime;
  const count = fn.EPDFForm_CountFields(model);
  const fields: FormFieldDTO[] = [];
  const actionBudget = new ActionReadBudgetTracker();
  for (let i = 0; i < count; i++) {
    fields.push(readFieldAt(runtime, model, i, actionBudget));
  }
  const calculationOrder: FormSnapshot['calculationOrder'] = [];
  const calculationCount = fn.EPDFForm_CountCalculationOrder(model);
  for (let index = 0; index < calculationCount; index++) {
    const fieldIndex = fn.EPDFForm_GetCalculationOrderFieldIndex(model, index);
    calculationOrder.push(
      fieldIndex >= 0 && fieldIndex < fields.length ? fields[fieldIndex].ref : null,
    );
  }
  return {
    formKind: FORM_KIND_BY_CODE[fn.EPDFForm_GetFormKind(model)] ?? 'none',
    needsAppearances: fn.EPDFForm_GetNeedAppearances(model),
    fields,
    calculationOrder,
  };
}

function readValueEntry(
  runtime: PdfRuntimeModule,
  model: Ptr,
  fieldIndex: number,
  isDefault: boolean,
): FormValueEntry {
  const { fn } = runtime;
  const kind = isDefault
    ? fn.EPDFForm_GetFieldDefaultValueKind(model, fieldIndex)
    : fn.EPDFForm_GetFieldValueKind(model, fieldIndex);
  if (kind === 0) return { kind: 'none' };
  if (kind === 3) return { kind: 'unsupported' };
  if (kind !== 1 && kind !== 2) return { kind: 'unsupported' };
  const count = isDefault
    ? fn.EPDFForm_CountFieldDefaultValues(model, fieldIndex)
    : fn.EPDFForm_CountFieldValues(model, fieldIndex);
  const values: string[] = [];
  for (let index = 0; index < count; index++) {
    values.push(
      readWide(runtime, (buf, capacity) =>
        isDefault
          ? fn.EPDFForm_GetFieldDefaultValueAt(model, fieldIndex, index, buf, capacity)
          : fn.EPDFForm_GetFieldValueAt(model, fieldIndex, index, buf, capacity),
      ),
    );
  }
  return kind === 1 ? { kind: 'scalar', value: values[0] ?? '' } : { kind: 'array', values };
}

function entryScalar(entry: FormValueEntry): string {
  if (entry.kind === 'scalar') return entry.value;
  if (entry.kind === 'array') return entry.values[0] ?? '';
  return '';
}

function readFieldActions(
  runtime: PdfRuntimeModule,
  model: Ptr,
  fieldIndex: number,
  budget: ActionReadBudgetTracker,
): PdfFieldActions | undefined {
  const { fn, mem } = runtime;
  const entries = [
    ['keystroke', 0],
    ['format', 1],
    ['validate', 2],
    ['calculate', 3],
  ] as const;
  const actions: PdfFieldActions = {};
  for (const [key, event] of entries) {
    const action = readActionModel(
      fn,
      mem,
      fn.EPDFForm_GetFieldActionModel(model, fieldIndex, event),
      budget,
    );
    if (action) actions[key] = action;
  }
  return Object.keys(actions).length > 0 ? actions : undefined;
}
