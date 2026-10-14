import { EngineError, EngineErrorCode, type MetadataPatch } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { writeMetaText } from './writeMetaText';
import { writeMetaTrapped } from './writeMetaTrapped';
import { formatPdfDate } from '../../../../shared/pdf-date';

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
 * Apply a three-state {@link MetadataPatch} to the document's Info dict
 * in place. `undefined` leaves a field, `null` clears it, a value sets
 * it (dates are formatted to PDF date syntax); `''` is a value.
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
}
