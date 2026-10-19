import {
  EngineError,
  EngineErrorCode,
  type CustomMetadataPatch,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { writeMetaText } from './writeMetaText';

/**
 * The standard Info-dict keys, which `metadata.update` owns. A custom write to
 * `Title` would shadow the structured field, so a custom key may not be one.
 */
const STANDARD_INFO_KEYS = new Set([
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Producer',
  'Creator',
  'CreationDate',
  'ModDate',
  'Trapped',
]);

/**
 * Why a custom key can't be written, or `null` when it can: it must be
 * writable as a PDF Name (non-empty printable ASCII, at most 127 characters,
 * no leading slash) and must not be a standard key.
 */
function customKeyProblem(key: string): string | null {
  if (STANDARD_INFO_KEYS.has(key)) {
    return `'${key}' is a standard key; set it with metadata.update`;
  }
  if (!key || key.length > 127 || key[0] === '/') {
    return `'${key}' can't be a custom key: 1 to 127 characters, no leading slash`;
  }
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return `'${key}' can't be a custom key: printable ASCII only`;
  }
  return null;
}

/**
 * Apply a {@link CustomMetadataPatch} to the document's Info dict in place:
 * a string sets its key (`''` is a value), `null` removes it, a key left out
 * stays. A standard or malformed key is `InvalidArg` naming it, before
 * anything is written.
 *
 * Throws {@link EngineError} `Unknown` if any native write fails, so the
 * caller never reports a partially-applied edit as success.
 */
export function applyCustomMetadataPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  patch: CustomMetadataPatch,
): void {
  const entries = Object.entries(patch);
  for (const [key] of entries) {
    const problem = customKeyProblem(key);
    if (problem) {
      throw new EngineError(EngineErrorCode.InvalidArg, problem, { details: { field: key } });
    }
  }
  for (const [key, value] of entries) {
    if (!writeMetaText(fn, mem, docPtr, key, value)) {
      throw new EngineError(EngineErrorCode.Unknown, `failed to write metadata ${key}`);
    }
  }
}
