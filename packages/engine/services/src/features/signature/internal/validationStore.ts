import {
  EngineError,
  EngineErrorCode,
  VALIDATION_INFO_KINDS,
  type ValidationInfo,
  type ValidationInfoKind,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from '../../../runtime/memory/scratch';

/** EPDF_DSS_* in public/epdf_signature.h. */
const KIND_CODE: Record<ValidationInfoKind, number> = {
  certificates: 0,
  ocspResponses: 1,
  crls: 2,
};

/**
 * Every entry of the document's security store, as stored: each kind's list,
 * then what only the store's index names, each stream once. It reads
 * `docPtr` as it is now, an entry added and not yet saved included.
 */
export function readValidationStore(runtime: PdfRuntimeModule, docPtr: Ptr): ValidationInfo {
  const out: ValidationInfo = { certificates: [], ocspResponses: [], crls: [] };
  for (const kind of VALIDATION_INFO_KINDS) out[kind] = readKind(runtime, docPtr, kind);
  return out;
}

function readKind(runtime: PdfRuntimeModule, docPtr: Ptr, kind: ValidationInfoKind): Uint8Array[] {
  const { fn, mem } = runtime;
  const count = fn.EPDFDss_GetCount(docPtr, KIND_CODE[kind]);
  const entries: Uint8Array[] = [];
  for (let index = 0; index < count; index++) {
    const length = fn.EPDFDss_GetData(docPtr, KIND_CODE[kind], index, NULL_PTR, 0);
    // A stream whose data can't be decoded reads as nothing: there is no entry to hand on.
    if (length <= 0) continue;
    entries.push(
      withScratch(mem, length, (buffer) => {
        const written = fn.EPDFDss_GetData(docPtr, KIND_CODE[kind], index, buffer, length);
        if (written !== length) {
          throw new EngineError(
            EngineErrorCode.Unknown,
            `failed to read entry ${index} of the document's ${kind}`,
          );
        }
        // A copy: the scratch buffer is freed when this returns.
        return new Uint8Array(mem.readBytes(buffer, length));
      }),
    );
  }
  return entries;
}

/**
 * Store `entry` in the document's security store, as a stream of its own
 * named in the list of `kind`. The store and the list are made when they
 * are missing. The caller checked the entry and that the document doesn't
 * hold it yet.
 */
export function addToValidationStore(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  kind: ValidationInfoKind,
  entry: Uint8Array,
): void {
  const { fn, mem } = runtime;
  const stored = withScratch(mem, entry.byteLength, (data) => {
    mem.writeBytes(data, entry);
    return fn.EPDFDss_Add(docPtr, KIND_CODE[kind], data, entry.byteLength);
  });
  if (stored === 0) {
    // The fork refuses a store it can't extend: a /DSS or a list of another type.
    throw new EngineError(
      EngineErrorCode.MalformedPdf,
      `the document's security store can't be extended: its /DSS or its list of ${kind} is not what the PDF standard says it is`,
    );
  }
}
