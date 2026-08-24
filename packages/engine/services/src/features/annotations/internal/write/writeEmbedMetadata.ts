import type { AnnotationActor } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

/**
 * Write the EmbedPDF-namespaced /EMBD_Metadata annotation dictionary.
 *
 * This module owns ONLY the vendor-extension dictionary. Standard PDF
 * base fields (/T, /M, /NM, /Contents) are handled by
 * `writers/annotations/base.ts` — /EMBD_Metadata is a separate
 * dictionary nested under the annotation that carries cloud-side
 * identity bookkeeping which has no PDF-spec equivalent.
 *
 * Schema (v1):
 *   /EMBD_Metadata <<
 *     /SchemaVersion 1                       % EmbedPDF metadata schema version
 *     /UserID    (acme/alice)                % identity that created the annotation
 *     /GroupID   (engineering)               % group the annotation belongs to
 *     /CreatedBy (acme/alice)                % same as UserID on create
 *     /UpdatedBy (acme/alice)                % last editor; refreshed on every update
 *   >>
 *
 * Read side: see `readers/annotations/embed-metadata.ts` (commit 12).
 *
 * PDFium bindings used: the `EPDFAnnot_*EmbedMetadata*` extension API
 * shipped in the EmbedPDF PDFium fork. Values are written as UTF-16LE
 * strings via the same `mem.writeU16String` pattern the base writer
 * uses for /T.
 */

const KEY_SCHEMA_VERSION = 'SchemaVersion';
const KEY_USER_ID = 'UserID';
const KEY_GROUP_ID = 'GroupID';
const KEY_CREATED_BY = 'CreatedBy';
const KEY_UPDATED_BY = 'UpdatedBy';

/**
 * Current EmbedPDF metadata schema version. Bump if/when the field set
 * or semantics change; readers tolerate older versions by falling back
 * to the fields they recognise.
 */
export const EMBD_METADATA_SCHEMA_VERSION = 1;

/**
 * Stamp /EMBD_Metadata on a freshly created annotation. No-op if the
 * actor has no identity fields — the worker still emits the standard
 * /M timestamp via the base writer; only the vendor dictionary is
 * skipped.
 *
 *   actor.userId    → /UserID, /CreatedBy, /UpdatedBy
 *   actor.groupId   → /GroupID
 *
 * /SchemaVersion is written whenever any field is written.
 */
export function applyEmbedMetadataOnCreate(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  actor: AnnotationActor | undefined,
): void {
  if (!actor || (!actor.userId && !actor.groupId)) return;

  fn.EPDFAnnot_SetEmbedMetadataNumber(annotPtr, KEY_SCHEMA_VERSION, EMBD_METADATA_SCHEMA_VERSION);

  if (actor.userId) {
    setMetadataString(fn, mem, annotPtr, KEY_USER_ID, actor.userId);
    setMetadataString(fn, mem, annotPtr, KEY_CREATED_BY, actor.userId);
    setMetadataString(fn, mem, annotPtr, KEY_UPDATED_BY, actor.userId);
  }
  if (actor.groupId) {
    setMetadataString(fn, mem, annotPtr, KEY_GROUP_ID, actor.groupId);
  }
}

/**
 * Apply /EMBD_Metadata refreshes on update. Two fields can change on
 * update; everything else (UserID, CreatedBy) is immutable.
 *
 *   actor.userId  → /UpdatedBy (refreshed every update where the
 *                   caller has an identity)
 *   actor.groupId → /GroupID   (reassigned only when the patch
 *                   explicitly contains a new groupId; route runs
 *                   `checkSetGroup` first)
 *
 * If the target annotation has no EMBD_Metadata yet (created before
 * the cloud started stamping, or by a non-cloud writer), we seed
 * /SchemaVersion so subsequent readers can find the marker.
 *
 * No-op when the actor has neither userId nor groupId.
 */
export function applyEmbedMetadataOnUpdate(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  actor: AnnotationActor | undefined,
): void {
  if (!actor || (!actor.userId && !actor.groupId)) return;

  if (!fn.EPDFAnnot_HasEmbedMetadata(annotPtr)) {
    fn.EPDFAnnot_SetEmbedMetadataNumber(annotPtr, KEY_SCHEMA_VERSION, EMBD_METADATA_SCHEMA_VERSION);
  }
  if (actor.userId) {
    setMetadataString(fn, mem, annotPtr, KEY_UPDATED_BY, actor.userId);
  }
  if (actor.groupId) {
    setMetadataString(fn, mem, annotPtr, KEY_GROUP_ID, actor.groupId);
  }
}

function setMetadataString(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  key: string,
  value: string,
): void {
  // Mirror the UTF-16LE pattern from writers/annotations/base.ts:
  // FPDFAnnot_SetStringValue and EPDFAnnot_SetEmbedMetadataString share
  // the same FPDF_WIDESTRING value shape, so we use the same helper.
  const ptr = mem.writeU16String(value);
  try {
    fn.EPDFAnnot_SetEmbedMetadataString(annotPtr, key, ptr);
  } finally {
    mem.free(ptr);
  }
}
