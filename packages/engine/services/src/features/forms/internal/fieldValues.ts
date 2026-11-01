import type { FormValueEntry } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withWideStringArray } from '../../../runtime/memory/wideStringArray';
import { withI32Array } from '../../../runtime/memory/scratch';

/** `EPDF_FORM_VALUE_*`: how the fork's value writers take a value. */
const VALUE_KIND = { none: 0, scalar: 1, array: 2 } as const;

/**
 * Write a field's `/V` (or `/DV`, for `'default'`) as `entry` holds it: none,
 * one value, or several. The fork writes it as told (a checkbox's or radio
 * group's value as a name) and writes nothing when the field already holds
 * it. `false` when the fork refuses it.
 */
export function writeFieldEntry(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  entry: FormValueEntry,
  which: 'value' | 'default',
): boolean {
  const { fn } = runtime;
  if (entry.kind === 'unsupported') return false;
  const values =
    entry.kind === 'scalar' ? [entry.value] : entry.kind === 'array' ? entry.values : [];
  const write = which === 'value' ? fn.EPDFForm_SetFieldValue : fn.EPDFForm_SetFieldDefaultValue;
  return withWideStringArray(runtime, values, (valuesPtr, count) =>
    write(docPtr, fieldObjectNumber, VALUE_KIND[entry.kind], valuesPtr, count),
  );
}

/** Write a choice field's `/I`: the positions of its selected options. */
export function writeSelectedIndices(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  indices: readonly number[],
): boolean {
  return withI32Array(runtime.mem, indices, (indicesPtr, count) =>
    runtime.fn.EPDFForm_SetFieldSelectedIndices(docPtr, fieldObjectNumber, indicesPtr, count),
  );
}
