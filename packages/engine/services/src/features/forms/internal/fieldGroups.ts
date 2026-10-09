import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { readFieldGroup } from './fieldAttribution';
import { acquireFormModel } from './formModelCache';
import { FAMILY_BY_CODE } from './readFormSnapshot';
import type { DocumentSession } from '../../../document-session/DocumentSession';
import { readUtf16String } from '../../../runtime/memory/strings';

/** The group of the field `fieldObjectNumber`; `null` in none, or when the form has no such field. */
export function groupOfField(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  fieldObjectNumber: number,
): string | null {
  const model = acquireFormModel(runtime, session);
  const index = runtime.fn.EPDFForm_GetFieldIndexByObjNum(model, fieldObjectNumber);
  return index < 0 ? null : readFieldGroup(runtime, model, index);
}

/**
 * What signing a field of `groupId` locks when the signing names no lock:
 * the full names of the group's fields, read now, so fields added since the
 * group was set up are covered. Its signature fields are left out: their
 * signers still sign them, and a locked signature field can't be signed.
 */
export function groupLockFields(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  groupId: string,
): string[] {
  const { fn, mem } = runtime;
  const model = acquireFormModel(runtime, session);
  const names: string[] = [];
  const count = fn.EPDFForm_CountFields(model);
  for (let index = 0; index < count; index++) {
    if (readFieldGroup(runtime, model, index) !== groupId) continue;
    if (FAMILY_BY_CODE[fn.EPDFForm_GetFieldFamily(model, index)] === 'signature') continue;
    const name = readUtf16String(mem, (buf, cap) =>
      fn.EPDFForm_GetFieldName(model, index, buf, cap),
    );
    if (name) names.push(name);
  }
  return names;
}
