import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readMetaText } from './readMetadataText';
import { readUtf8String } from '../../../runtime/memory/strings';

/**
 * Read the name of one key in the document's Info dictionary.
 * customOnly = true returns only non-reserved (custom) keys, matching the
 * behavior of `getMetaKeyName` in the legacy engine. Key names come back
 * as UTF-8.
 */
function readMetaKeyName(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: number,
  customOnly: boolean,
): string | null {
  return readUtf8String(mem, (buf, capacity) =>
    fn.EPDF_GetMetaKeyName(docPtr, index, customOnly, buf, capacity),
  );
}

/**
 * Read all custom metadata key/value pairs from the document's Info
 * dictionary. The wire format guarantees `string` values, so absent keys
 * are dropped (rather than represented as null).
 *
 * Mirrors the legacy `readAllMeta` (engine.ts:4698) but tightens the type
 * to Record<string, string> for the wire format.
 */
export function readAllCustomMeta(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
): Record<string, string> {
  const count = Number(fn.EPDF_GetMetaKeyCount(docPtr, true)) | 0;
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const key = readMetaKeyName(fn, mem, docPtr, i, true);
    if (!key) continue;
    const value = readMetaText(fn, mem, docPtr, key);
    if (value == null) continue;
    out[key] = value;
  }
  return out;
}
