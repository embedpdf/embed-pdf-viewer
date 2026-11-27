import { EngineError, EngineErrorCode, isFieldPurpose } from '@embedpdf/engine-core/runtime';
import type { AnnotationActor, IsoDateTime } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from '../../../runtime/memory/scratch';
import { readUtf16String } from '../../../runtime/memory/strings';
import { formatPdfDate, pdfDateToIso } from '../../../shared/pdf-date';
import { EMBD_METADATA_SCHEMA_VERSION } from '../../annotations/internal/write/writeEmbedMetadata';

/**
 * Who made a field, the group it belongs to and what its value means, kept
 * in the field's own `/EMBD_Metadata` the way an annotation keeps its author
 * and group:
 *
 *   /EMBD_Metadata <<
 *     /SchemaVersion 1
 *     /GroupID      (buyer)                     % who fills it in
 *     /ForAnyone    true                        % or: every signer fills it in
 *     /Purpose      (email)                     % what its value means
 *     /CreatedBy    (u-17)                      % the creating session's user
 *     /CreatedAt    (D:20261008104200+00'00')
 *     /ImportedBy   (u-9)                       % set only by a restoring import
 *   >>
 *
 * All of it describes the form's design, and only a design write writes it:
 * a fill writes the value and its drawing, as every PDF app does, and
 * nothing of ours. A signature made before a fill seals the field's
 * dictionary, and Acrobat reads any other change to it as the document
 * altered (`output/anyone-fields-acrobat-check` in the platform repo). The
 * `/FilledBy`, `/FilledByName` and `/FilledAt` an older version stamped on
 * every fill are left as they are and never read.
 *
 * The engine stamps the attribution from the session's identity, never from
 * what a caller sends. An anonymous session names nobody: it stamps no
 * creation. The group is what the caller sets, with the authority to set
 * it, and so are `forAnyone` and the purpose, which the engine keeps and
 * reads nothing into.
 */
export interface FieldAttribution {
  readonly createdBy: string | null;
  readonly createdAt: IsoDateTime | null;
  readonly importedBy: string | null;
}

const KEY_SCHEMA_VERSION = 'SchemaVersion';
const KEY_GROUP_ID = 'GroupID';
const KEY_FOR_ANYONE = 'ForAnyone';
const KEY_PURPOSE = 'Purpose';
const KEY_CREATED_BY = 'CreatedBy';
const KEY_CREATED_AT = 'CreatedAt';
const KEY_IMPORTED_BY = 'ImportedBy';

/** `EPDF_FORMFIELD_FAMILY_SIGNATURE` in public/epdf_form.h. */
const FAMILY_SIGNATURE = 7;

const NO_ATTRIBUTION: FieldAttribution = { createdBy: null, createdAt: null, importedBy: null };

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

/** Put a field in `groupId`; `null` takes it out of its group. */
export function writeFieldGroup(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  groupId: string | null,
): void {
  writeAttribution(runtime, docPtr, fieldObjectNumber, [[KEY_GROUP_ID, groupId]]);
}

/**
 * Whether anyone fills in field `fieldIndex` of a loaded form model. Never
 * a field in a group, nor a signature field: an entry another tool left on
 * one reads as `false`, so the field is that group's or its signer's.
 */
export function readFieldForAnyone(
  runtime: PdfRuntimeModule,
  model: Ptr,
  fieldIndex: number,
): boolean {
  if (!readForAnyoneEntry(runtime, model, fieldIndex)) return false;
  if (FAMILY_SIGNATURE === runtime.fn.EPDFForm_GetFieldFamily(model, fieldIndex)) return false;
  return readFieldGroup(runtime, model, fieldIndex) === null;
}

/**
 * The field's `ForAnyone` entry as it is stored, beside a group or on a
 * signature field too: what a write compares with what the field should
 * hold, so an entry that reads as `false` never comes back.
 */
export function readForAnyoneEntry(
  runtime: PdfRuntimeModule,
  model: Ptr,
  fieldIndex: number,
): boolean {
  const { fn, mem } = runtime;
  if (!fn.EPDFForm_HasFieldEmbedMetadata(model, fieldIndex)) return false;
  return withScratch(
    mem,
    4,
    (out) =>
      fn.EPDFForm_GetFieldEmbedMetadataBoolean(model, fieldIndex, KEY_FOR_ANYONE, out) &&
      mem.peek(out, 'i32') !== 0,
  );
}

/** Make a field one anyone fills in; `false` takes the entry away. */
export function writeFieldForAnyone(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  forAnyone: boolean,
): void {
  writeAttribution(runtime, docPtr, fieldObjectNumber, []);
  if (!forAnyone) {
    clearEntry(runtime, docPtr, fieldObjectNumber, KEY_FOR_ANYONE);
    return;
  }
  if (
    !runtime.fn.EPDFForm_SetFieldEmbedMetadataBoolean(
      docPtr,
      fieldObjectNumber,
      KEY_FOR_ANYONE,
      true,
    )
  ) {
    throw attributionFailed(fieldObjectNumber);
  }
}

/**
 * The purpose of field `fieldIndex` of a loaded form model; `null` with
 * none. An entry that is no purpose a write takes (another tool's, or one
 * with space around it) reads as none, so every purpose read can be
 * written back.
 */
export function readFieldPurpose(
  runtime: PdfRuntimeModule,
  model: Ptr,
  fieldIndex: number,
): string | null {
  const { fn, mem } = runtime;
  if (!fn.EPDFForm_HasFieldEmbedMetadata(model, fieldIndex)) return null;
  const purpose = readUtf16String(
    mem,
    (buf, cap) => fn.EPDFForm_GetFieldEmbedMetadataString(model, fieldIndex, KEY_PURPOSE, buf, cap),
    null,
  );
  return isFieldPurpose(purpose) ? purpose : null;
}

/** Give a field the purpose `purpose`; `null` takes its purpose away. */
export function writeFieldPurpose(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  purpose: string | null,
): void {
  writeAttribution(runtime, docPtr, fieldObjectNumber, [[KEY_PURPOSE, purpose]]);
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
