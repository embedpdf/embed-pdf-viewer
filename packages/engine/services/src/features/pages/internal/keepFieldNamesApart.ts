import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';
import { withScratch } from '../../../runtime/memory/scratch';
import { readUtf16String, withUtf16String } from '../../../runtime/memory/strings';
import { acquireFormModel } from '../../forms/internal/formModelCache';

/**
 * Keeps the form fields an insert brings apart from the document's own. A
 * top-level field of the inserted file whose name the document already uses
 * takes the first free `name_2`, `name_3`, ...: two fields of one name are one
 * field with one value, so joining them would lose the inserted file's
 * values. Its fields keep their place under it (`address.city` becomes
 * `address_2.city`).
 *
 * The rename is made in the inserted file (`srcPtr`, a copy the engine
 * opened) before its pages are copied: `EPDFDoc_ImportPages` keeps names.
 */
export function keepFieldNamesApart(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  srcPtr: Ptr,
): void {
  const { fn, mem } = runtime;
  const roots = importFieldRoots(runtime, srcPtr);
  if (roots.length === 0) return;
  const names = roots.map(
    (objectNumber) =>
      readUtf16String(mem, (buf, capacity) =>
        fn.EPDFForm_GetFieldPartialName(srcPtr, objectNumber, buf, capacity),
      ) ?? '',
  );
  const taken = topLevelNames(runtime, session);
  const used = new Set([...taken, ...names]);
  roots.forEach((objectNumber, at) => {
    const name = names[at]!;
    if (!taken.has(name)) return;
    let free = name;
    for (let n = 2; used.has(free); n++) free = `${name}_${n}`;
    used.add(free);
    const renamed = withUtf16String(mem, free, (ptr) =>
      fn.EPDFForm_SetFieldName(srcPtr, objectNumber, ptr),
    );
    if (!renamed) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `pages.insert could not rename the inserted field "${name}" to "${free}"`,
      );
    }
  });
}

/** The object numbers of the top-level fields an insert of every page of `srcPtr` brings. */
function importFieldRoots(runtime: PdfRuntimeModule, srcPtr: Ptr): number[] {
  const { fn, mem } = runtime;
  const count = fn.EPDFDoc_GetImportFieldRoots(srcPtr, NULL_PTR, 0, NULL_PTR, 0);
  if (count <= 0) return [];
  return withScratch(mem, count * 4, (buf) => {
    fn.EPDFDoc_GetImportFieldRoots(srcPtr, NULL_PTR, 0, buf, count);
    return Array.from({ length: count }, (_, at) => Number(mem.peek(buf, 'i32', at * 4)));
  });
}

/** The names of the document's top-level fields: `address` for `address.city`. */
function topLevelNames(runtime: PdfRuntimeModule, session: DocumentSession): Set<string> {
  const { fn, mem } = runtime;
  const model = acquireFormModel(runtime, session);
  const names = new Set<string>();
  for (let index = 0; index < fn.EPDFForm_CountFields(model); index++) {
    const name = readUtf16String(mem, (buf, capacity) =>
      fn.EPDFForm_GetFieldName(model, index, buf, capacity),
    );
    if (name) names.add(name.split('.')[0]!);
  }
  return names;
}
