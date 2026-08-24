import type { FormFieldRef } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { readUtf16String } from '../../../runtime/memory/strings';

export interface ResolvedField {
  /** Index of the field in the native model. */
  fieldIndex: number;
  /** Indirect object number of the field dictionary; `0` for direct dicts. */
  fieldObjectNumber: number;
}

/**
 * Resolve a caller ref against the native model. `objectNumber` refs use
 * the model's reverse index; `fqn` refs compare fully qualified names.
 * Throws `NotFound` when nothing matches.
 */
export function resolveFieldRef(
  runtime: PdfRuntimeModule,
  model: Ptr,
  ref: FormFieldRef,
): ResolvedField {
  const { fn } = runtime;
  if (ref.kind === 'objectNumber') {
    const fieldIndex = fn.EPDFForm_GetFieldIndexByObjNum(model, ref.fieldObjectNumber);
    if (fieldIndex < 0) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `form field not found: object ${ref.fieldObjectNumber}`,
      );
    }
    return { fieldIndex, fieldObjectNumber: ref.fieldObjectNumber };
  }

  const count = fn.EPDFForm_CountFields(model);
  for (let i = 0; i < count; i++) {
    const name =
      readUtf16String(runtime.mem, (buf, cap) => fn.EPDFForm_GetFieldName(model, i, buf, cap)) ??
      '';
    if (name === ref.name) {
      return { fieldIndex: i, fieldObjectNumber: fn.EPDFForm_GetFieldObjNum(model, i) };
    }
  }
  throw new EngineError(EngineErrorCode.NotFound, `form field not found: "${ref.name}"`);
}
