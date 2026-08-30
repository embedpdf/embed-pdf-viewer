import type { AnnotationDraftBase, AnnotationPatchBase } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import {
  setAnnotFlags,
  writeAnnotString,
  writeAnnotStringOrClear,
} from './annotationWritePrimitives';
import { formatPdfDate } from '../../../../shared/pdf-date';

/**
 * Write the annotation-wide base fields shared by every Draft
 * (contents/subject/nm). The kind-specific writer calls this BEFORE its
 * own field writes; order doesn't actually matter at the PDF level, but
 * keeping the base first makes the writers symmetric with the readers.
 *
 * `/T` (author display) is stamped by the mutator from
 * `AnnotationActor.displayName` via {@link writeAnnotationAuthor}.
 *
 * `nm` is written verbatim if the caller supplied one. The mutator
 * decides whether to opportunistically stamp a UUID v4 on a weak
 * annotation; the writer does not.
 */
export function applyAnnotationBaseDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: AnnotationDraftBase,
): void {
  if (draft.contents !== undefined) {
    writeAnnotStringOrClear(fn, mem, annotPtr, 'Contents', draft.contents);
  }
  if (draft.subject !== undefined) {
    writeAnnotStringOrClear(fn, mem, annotPtr, 'Subj', draft.subject);
  }
  if (draft.nm !== undefined && draft.nm.length > 0) {
    writeAnnotString(fn, mem, annotPtr, 'NM', draft.nm);
  }
  if (draft.flags !== undefined) {
    setAnnotFlags(fn, annotPtr, draft.flags);
  }
}

/**
 * Write the annotation-wide base fields shared by every Patch
 * (contents/subject). /T is bound at creation and not patchable — see
 * `AnnotationPatchBase`. /NM is monotonic per annotation; the mutator
 * may stamp /NM opportunistically on a weak annotation via
 * `writeAnnotationNm`.
 *
 * Three-state semantics on string|null fields:
 *   undefined -> don't touch the dict
 *   null      -> remove the entry
 *   "..."     -> set the entry to that value
 */
export function applyAnnotationBasePatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: AnnotationPatchBase,
): void {
  if (patch.contents !== undefined) {
    writeAnnotStringOrClear(fn, mem, annotPtr, 'Contents', patch.contents);
  }
  if (patch.subject !== undefined) {
    writeAnnotStringOrClear(fn, mem, annotPtr, 'Subj', patch.subject);
  }
  if (patch.flags !== undefined) {
    setAnnotFlags(fn, annotPtr, patch.flags);
  }
}

/**
 * Stamp /T (the standard PDF "author" display field) on an annotation.
 * Called by the mutator on CREATE — /T is bound to the caller's
 * `display_name` at creation. No-op when `displayName` is empty so
 * callers don't need to gate it.
 */
export function writeAnnotationAuthor(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  displayName: string,
): void {
  if (displayName.length === 0) return;
  writeAnnotString(fn, mem, annotPtr, 'T', displayName);
}

/**
 * Stamp /NM on an annotation that didn't have one. Used by the mutator
 * (not by the writers proper) to upgrade a weak annotation to durable
 * identity during update. Idempotent and silent if the value is empty.
 */
export function writeAnnotationNm(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  nm: string,
): void {
  if (nm.length === 0) return;
  writeAnnotString(fn, mem, annotPtr, 'NM', nm);
}

/**
 * Stamp /M (modification date) on an annotation. /M is a standard
 * ISO 32000 base annotation field — the moment of the last edit — so
 * it lives here alongside /T / /NM / /Contents rather than in any
 * vendor-namespaced extension.
 *
 * Called by the mutator on every annotation create AND every update;
 * the existing base draft/patch writers leave /M alone because the
 * value is derived from the moment of the write, not from the
 * draft/patch payload. The base reader already extracts /M and
 * surfaces it on `AnnotationBase.modified`.
 *
 * Format: `D:YYYYMMDDHHmmSSOHH'mm'` (see formatPdfDate).
 */
export function writeAnnotationModified(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  now: Date = new Date(),
): void {
  writeAnnotString(fn, mem, annotPtr, 'M', formatPdfDate(now));
}
