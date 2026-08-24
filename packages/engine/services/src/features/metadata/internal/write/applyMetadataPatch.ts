import { EngineError, EngineErrorCode, type MetadataPatch } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { writeMetaText } from './writeMetaText';
import { writeMetaTrapped } from './writeMetaTrapped';
import { formatPdfDate } from '../../../../shared/pdf-date';

/**
 * Standard Info-dict keys the patch maps to explicitly. Custom keys may
 * not collide with these (a custom write to `Title` would shadow the
 * structured field), so they are skipped with the date keys and /Trapped.
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
 * A custom key must be writable as a PDF Name and must not shadow a
 * reserved standard key. Mirrors v2 `isValidCustomKey` (helper.ts):
 * non-empty ASCII printable, <= 127 chars, no leading slash.
 */
function isValidCustomKey(key: string): boolean {
  if (!key || key.length > 127) return false;
  if (RESERVED_INFO_KEYS.has(key)) return false;
  if (key[0] === '/') return false;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
}

/**
 * Apply a three-state {@link MetadataPatch} to the document's Info dict
 * in place. `undefined` leaves a field, `null` clears it, a value sets
 * it (dates are formatted to PDF date syntax). Custom keys are set/cleared
 * per-key; reserved or malformed keys are skipped.
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

  for (const [field, key] of STRING_FIELDS) {
    const value = patch[field] as string | null | undefined;
    if (value === undefined) continue;
    if (!writeMetaText(fn, mem, docPtr, key, value)) fail(key);
  }

  if (patch.created !== undefined) {
    const value = patch.created === null ? null : formatPdfDate(new Date(patch.created));
    if (!writeMetaText(fn, mem, docPtr, 'CreationDate', value)) fail('CreationDate');
  }
  if (patch.modified !== undefined) {
    const value = patch.modified === null ? null : formatPdfDate(new Date(patch.modified));
    if (!writeMetaText(fn, mem, docPtr, 'ModDate', value)) fail('ModDate');
  }

  if (patch.trapped !== undefined) {
    if (!writeMetaTrapped(fn, docPtr, patch.trapped)) fail('Trapped');
  }

  if (patch.custom !== undefined) {
    for (const [key, value] of Object.entries(patch.custom)) {
      if (!isValidCustomKey(key)) continue;
      if (!writeMetaText(fn, mem, docPtr, key, value)) fail(key);
    }
  }
}
