import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { AnnotationActor, IsoDateTime } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { readUtf16String } from '../../../runtime/memory/strings';
import { formatPdfDate, pdfDateToIso } from '../../../shared/pdf-date';
import { EMBD_METADATA_SCHEMA_VERSION } from '../../annotations/internal/write/writeEmbedMetadata';

/**
 * Who made a field and who last filled it in, and the group it belongs to,
 * kept in the field's own `/EMBD_Metadata` the way an annotation keeps its
 * author and group:
 *
 *   /EMBD_Metadata <<
 *     /SchemaVersion 1
 *     /GroupID      (buyer)                     % who fills it in
 *     /CreatedBy    (u-17)                      % the creating session's user
 *     /CreatedAt    (D:20261008104200+00'00')
 *     /FilledBy     (u-42)                      % the user whose write set the value
 *     /FilledByName (Ann de Vries)
 *     /FilledAt     (D:20261008104300+00'00')
 *     /ImportedBy   (u-9)                       % set only by a restoring import
 *   >>
 *
 * The engine stamps the attribution from the session's identity, never from
 * what a caller sends. An anonymous session names nobody: it stamps no
 * creation, and a fill clears the last filler, who no longer filled the
 * value. The group is what the caller sets, with the authority to set it.
 */
export interface FieldAttribution {
  readonly createdBy: string | null;
  readonly createdAt: IsoDateTime | null;
  readonly filledBy: string | null;
  readonly filledByName: string | null;
  readonly filledAt: IsoDateTime | null;
  readonly importedBy: string | null;
}

const KEY_SCHEMA_VERSION = 'SchemaVersion';
const KEY_GROUP_ID = 'GroupID';
const KEY_CREATED_BY = 'CreatedBy';
const KEY_CREATED_AT = 'CreatedAt';
const KEY_FILLED_BY = 'FilledBy';
const KEY_FILLED_BY_NAME = 'FilledByName';
const KEY_FILLED_AT = 'FilledAt';
const KEY_IMPORTED_BY = 'ImportedBy';

const NO_ATTRIBUTION: FieldAttribution = {
  createdBy: null,
  createdAt: null,
  filledBy: null,
  filledByName: null,
  filledAt: null,
  importedBy: null,
};

/** The attribution of field `fieldIndex` of a loaded form model. */
export function readFieldAttribution(
  runtime: PdfRuntimeModule,
  model: Ptr,
  fieldIndex: number,
): FieldAttribution {
  const { fn, mem } = runtime;
  if (!fn.EPDFForm_HasFieldEmbedMetadata(model, fieldIndex)) return NO_ATTRIBUTION;
  // An empty entry names nobody, as a missing one does.
  const text = (key: string) =>
    readUtf16String(
      mem,
      (buf, cap) => fn.EPDFForm_GetFieldEmbedMetadataString(model, fieldIndex, key, buf, cap),
      null,
    );
  const date = (key: string) => {
    const value = text(key);
    return value === null ? null : pdfDateToIso(value);
  };
  return {
    createdBy: text(KEY_CREATED_BY),
    createdAt: date(KEY_CREATED_AT),
    filledBy: text(KEY_FILLED_BY),
    filledByName: text(KEY_FILLED_BY_NAME),
    filledAt: date(KEY_FILLED_AT),
    importedBy: text(KEY_IMPORTED_BY),
  };
}

/** The group of field `fieldIndex` of a loaded form model; `null` in no group. */
export function readFieldGroup(
  runtime: PdfRuntimeModule,
  model: Ptr,
  fieldIndex: number,
): string | null {
  const { fn, mem } = runtime;
  if (!fn.EPDFForm_HasFieldEmbedMetadata(model, fieldIndex)) return null;
  return readUtf16String(
    mem,
    (buf, cap) =>
      fn.EPDFForm_GetFieldEmbedMetadataString(model, fieldIndex, KEY_GROUP_ID, buf, cap),
    null,
  );
}

/** Put a field in `groupId`. A group is changed, never removed, so there is no clearing. */
export function writeFieldGroup(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  groupId: string,
): void {
  writeAttribution(runtime, docPtr, fieldObjectNumber, [[KEY_GROUP_ID, groupId]]);
}

/** Stamp a new field with who created it, and when. An anonymous session stamps nothing. */
export function stampFieldCreation(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  actor: AnnotationActor,
  now: Date = new Date(),
): void {
  if (!actor.userId) return;
  writeAttribution(runtime, docPtr, fieldObjectNumber, [
    [KEY_CREATED_BY, actor.userId],
    [KEY_CREATED_AT, formatPdfDate(now)],
  ]);
}

/**
 * Stamp a field whose value a write changed with who filled it in, and
 * when. An anonymous session clears the last filler instead.
 */
export function stampFieldFill(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  actor: AnnotationActor,
  now: Date = new Date(),
): void {
  if (!actor.userId) {
    clearFieldFill(runtime, docPtr, fieldObjectNumber);
    return;
  }
  writeAttribution(runtime, docPtr, fieldObjectNumber, [
    [KEY_FILLED_BY, actor.userId],
    [KEY_FILLED_BY_NAME, actor.displayName ?? null],
    [KEY_FILLED_AT, formatPdfDate(now)],
  ]);
}

/**
 * Write who created a field and when, as a restoring import has it, and
 * the importing session's user as `importedBy`. A `null` clears the entry.
 */
export function restoreFieldCreation(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  from: Pick<FieldAttribution, 'createdBy' | 'createdAt'>,
  importedBy: string | null,
): void {
  writeAttribution(runtime, docPtr, fieldObjectNumber, [
    [KEY_CREATED_BY, from.createdBy],
    [KEY_CREATED_AT, from.createdAt ? formatPdfDate(from.createdAt) : null],
    [KEY_IMPORTED_BY, importedBy],
  ]);
}

/**
 * Write who filled a field in and when, as a restoring import has it, and
 * the importing session's user as `importedBy`. A `null` clears the entry.
 */
export function restoreFieldFill(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  from: Pick<FieldAttribution, 'filledBy' | 'filledByName' | 'filledAt'>,
  importedBy: string | null,
): void {
  writeAttribution(runtime, docPtr, fieldObjectNumber, [
    [KEY_FILLED_BY, from.filledBy],
    [KEY_FILLED_BY_NAME, from.filledByName],
    [KEY_FILLED_AT, from.filledAt ? formatPdfDate(from.filledAt) : null],
    [KEY_IMPORTED_BY, importedBy],
  ]);
}

/** Clear who filled a field in: a reset put its value back to its default. */
export function clearFieldFill(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
): void {
  for (const key of [KEY_FILLED_BY, KEY_FILLED_BY_NAME, KEY_FILLED_AT]) {
    clearEntry(runtime, docPtr, fieldObjectNumber, key);
  }
}

/** Write each entry of `entries`, clearing the ones whose value is `null`. */
function writeAttribution(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  entries: ReadonlyArray<readonly [key: string, value: string | null]>,
): void {
  const { fn, mem } = runtime;
  const wrote = fn.EPDFForm_SetFieldEmbedMetadataNumber(
    docPtr,
    fieldObjectNumber,
    KEY_SCHEMA_VERSION,
    EMBD_METADATA_SCHEMA_VERSION,
  );
  if (!wrote) throw attributionFailed(fieldObjectNumber);
  for (const [key, value] of entries) {
    if (value === null) {
      clearEntry(runtime, docPtr, fieldObjectNumber, key);
      continue;
    }
    const ptr = mem.writeU16String(value);
    try {
      if (!fn.EPDFForm_SetFieldEmbedMetadataString(docPtr, fieldObjectNumber, key, ptr)) {
        throw attributionFailed(fieldObjectNumber);
      }
    } finally {
      mem.free(ptr);
    }
  }
}

function clearEntry(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  key: string,
): void {
  if (!runtime.fn.EPDFForm_ClearFieldEmbedMetadataKey(docPtr, fieldObjectNumber, key)) {
    throw attributionFailed(fieldObjectNumber);
  }
}

function attributionFailed(fieldObjectNumber: number): EngineError {
  return new EngineError(
    EngineErrorCode.Unknown,
    `the metadata of field ${fieldObjectNumber} could not be written`,
  );
}
