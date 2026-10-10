import type { FieldValueWrite } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withWideStringArray } from './wideStringArray';

/**
 * Run a value write (`fieldValueWriteOf`, engine-core) on the field,
 * reporting changed widgets into the out buffer.
 */
export function applyNativeWrite(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  write: FieldValueWrite,
  changed: { buf: Ptr; cap: number; countPtr: Ptr },
): boolean {
  const { fn, mem } = runtime;
  const { buf, cap, countPtr } = changed;
  switch (write.kind) {
    case 'text': {
      const textPtr = mem.writeU16String(write.value);
      try {
        return fn.EPDFForm_SetTextValue(docPtr, fieldObjectNumber, textPtr, buf, cap, countPtr);
      } finally {
        mem.free(textPtr);
      }
    }
    case 'toggle':
      // An empty state clears the group, as the C API's null does.
      return fn.EPDFForm_SetToggle(
        docPtr,
        fieldObjectNumber,
        write.state ?? '',
        buf,
        cap,
        countPtr,
      );
    case 'choice':
      return withWideStringArray(runtime, write.values, (valuesPtr, count) =>
        fn.EPDFForm_SetChoiceValues(
          docPtr,
          fieldObjectNumber,
          valuesPtr,
          count,
          buf,
          cap,
          countPtr,
        ),
      );
  }
}
