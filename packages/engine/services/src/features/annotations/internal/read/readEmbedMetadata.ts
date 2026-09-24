import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';

/**
 * Decoded /EMBD_Metadata dictionary as seen from a single annotation.
 *
 * Mirrors the schema written by `writers/annotations/embed-metadata.ts`.
 * Each field is optional because:
 *   - older annotations (pre-cloud, or imported from other tools) have no
 *     /EMBD_Metadata at all,
 *   - the dict may be partially populated (e.g. only UserID, no GroupID),
 *   - future schema versions may add or drop fields.
 *
 * Readers tolerate missing fields by returning `undefined`; callers
 * decide how to render the absence (typically "unknown author" /
 * "no group").
 */
export interface EmbedMetadata {
  schemaVersion?: number;
  userId?: string;
  groupId?: string;
  createdBy?: string;
  updatedBy?: string;
  importedBy?: string;
}

/**
 * Read /EMBD_Metadata from an annotation, if present. Returns `null`
 * (not an empty object) when the annotation has no EMBD_Metadata
 * dictionary at all — the caller can distinguish "no metadata" from
 * "metadata with only some fields set".
 *
 * Uses the same UTF-16LE two-pass read pattern as `readAnnotString` in
 * `./util.ts` so a future change to the underlying memory helpers
 * propagates uniformly.
 */
export function readEmbedMetadata(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): EmbedMetadata | null {
  if (!fn.EPDFAnnot_HasEmbedMetadata(annotPtr)) return null;

  const schemaVersion = readMetaNumber(fn, mem, annotPtr, 'SchemaVersion');
  const userId = readEmbedMetadataString(fn, mem, annotPtr, 'UserID');
  const groupId = readEmbedMetadataString(fn, mem, annotPtr, 'GroupID');
  const createdBy = readEmbedMetadataString(fn, mem, annotPtr, 'CreatedBy');
  const updatedBy = readEmbedMetadataString(fn, mem, annotPtr, 'UpdatedBy');
  const importedBy = readEmbedMetadataString(fn, mem, annotPtr, 'ImportedBy');

  const out: EmbedMetadata = {};
  if (schemaVersion !== undefined) out.schemaVersion = schemaVersion;
  if (userId !== undefined) out.userId = userId;
  if (groupId !== undefined) out.groupId = groupId;
  if (createdBy !== undefined) out.createdBy = createdBy;
  if (updatedBy !== undefined) out.updatedBy = updatedBy;
  if (importedBy !== undefined) out.importedBy = importedBy;
  return out;
}

/** A string under `/EMBD_Metadata`, `undefined` when it is absent or empty. */
export function readEmbedMetadataString(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  key: string,
): string | undefined {
  // Two-pass UTF-16LE read mirroring readAnnotString:
  //   pass 1: NULL_PTR + 0 → returns required byte count (incl. null
  //           terminator, so an empty string returns 2)
  //   pass 2: alloc buf, fill it, decode
  const len = fn.EPDFAnnot_GetEmbedMetadataString(annotPtr, key, NULL_PTR, 0);
  // Every key read here is an id, and an empty id is no id. The native runtime
  // also reports a missing key as empty whenever the dictionary exists.
  if (len <= 2) return undefined;

  const buf = mem.alloc(len);
  try {
    const written = fn.EPDFAnnot_GetEmbedMetadataString(annotPtr, key, buf, len);
    if (written <= 0) return undefined;
    return mem.readU16String(buf);
  } finally {
    mem.free(buf);
  }
}

function readMetaNumber(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  key: string,
): number | undefined {
  const buf = mem.alloc(4); // float
  try {
    const ok = fn.EPDFAnnot_GetEmbedMetadataNumber(annotPtr, key, buf);
    if (!ok) return undefined;
    return Number(mem.peek(buf, 'f32'));
  } finally {
    mem.free(buf);
  }
}
