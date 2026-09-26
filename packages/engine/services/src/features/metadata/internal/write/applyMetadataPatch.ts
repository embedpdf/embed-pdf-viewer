import { EngineError, EngineErrorCode, type MetadataPatch } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { writeMetaText } from './writeMetaText';
import { writeMetaTrapped } from './writeMetaTrapped';
import { formatPdfDate } from '../../../../shared/pdf-date';

/**
 * Standard Info-dict keys the patch maps to explicitly. A custom key may
 * not be one of these (a custom write to `Title` would shadow the
 * structured field).
 */
const RESERVED_INFO_KEYS = new Set([
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
 * Standard string field -> PDF Info key. Date fields and /Trapped are
 * handled separately because they need format conversion / a dedicated
 * native setter.
 */
const STRING_FIELDS: ReadonlyArray<[keyof MetadataPatch, string]> = [
  ['title', 'Title'],
  ['author', 'Author'],
  ['subject', 'Subject'],
  ['keywords', 'Keywords'],
  ['producer', 'Producer'],
  ['creator', 'Creator'],
];

/**
 * Why a custom key can't be written, or `null` when it can: it must be
 * writable as a PDF Name (non-empty printable ASCII, at most 127 characters,
 * no leading slash) and must not be a standard key.
 */
function customKeyProblem(key: string): string | null {
  if (RESERVED_INFO_KEYS.has(key)) {
    return `'${key}' is a standard key; set it with its own field`;
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
 * Apply a three-state {@link MetadataPatch} to the document's Info dict
 * in place. `undefined` leaves a field, `null` clears it, a value sets
 * it (dates are formatted to PDF date syntax); `''` is a value. Custom keys
 * are set or cleared per key; a standard or malformed one is `InvalidArg`,
 * before anything is written.
 *
 * Throws {@link EngineError} `Unknown` if any native write fails, so the
 * caller never reports a partially-applied edit as success.
 */
export function applyMetadataPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  patch: MetadataPatch,
): void {
  const fail = (what: string): never => {
    throw new EngineError(EngineErrorCode.Unknown, `failed to write metadata ${what}`);
  };
  for (const key of Object.keys(patch.custom ?? {})) {
    const problem = customKeyProblem(key);
    if (problem) {
      throw new EngineError(EngineErrorCode.InvalidArg, problem, {
        details: { field: `custom.${key}` },
      });
    }
  }

  for (const [field, key] of STRING_FIELDS) {
    const value = patch[field] as string | null | undefined;
    if (value === undefined) continue;
    if (!writeMetaText(fn, mem, docPtr, key, value)) fail(key);
  }

  if (patch.createdAt !== undefined) {
    const value = patch.createdAt === null ? null : formatPdfDate(patch.createdAt);
    if (!writeMetaText(fn, mem, docPtr, 'CreationDate', value)) fail('CreationDate');
  }
  if (patch.modifiedAt !== undefined) {
    const value = patch.modifiedAt === null ? null : formatPdfDate(patch.modifiedAt);
    if (!writeMetaText(fn, mem, docPtr, 'ModDate', value)) fail('ModDate');
  }

  if (patch.trapped !== undefined) {
    if (!writeMetaTrapped(fn, docPtr, patch.trapped)) fail('Trapped');
  }

  if (patch.custom !== undefined) {
    for (const [key, value] of Object.entries(patch.custom)) {
      if (!writeMetaText(fn, mem, docPtr, key, value)) fail(key);
    }
  }
}
