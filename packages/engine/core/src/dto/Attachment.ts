/**
 * One vocabulary for "a file living inside a PDF" — shared by the
 * file-attachment annotation kind and the document-level EmbeddedFiles
 * service, on both the write and read sides:
 *
 *   write  -> {@link AttachmentFileSource}: the shared metadata fields plus
 *             inline `data` bytes (the [[BinarySource]] rule — bytes are a
 *             call argument, never engine state).
 *   read   -> {@link AttachmentFileInfo}: the same metadata fields plus
 *             engine-derived facts (size, checksum, creationDate) and never
 *             the bytes — listings stay cheap; bytes leave the engine only
 *             through an explicit download call.
 *
 * A file has exactly two possible homes: the document catalog's
 * `/EmbeddedFiles` name tree (addressed by {@link EmbeddedFileItem.index}),
 * and a FileAttachment annotation's `/FS` (addressed by the annotation ref).
 */

/** Metadata fields shared by the write and read forms. */
export interface AttachmentFileBase {
  /** File name — `/UF` (and `/F`) on the filespec. */
  name: string;
  /** MIME type — `/Subtype` of the embedded file stream. */
  mimeType?: string;
  /** Human-readable description — `/Desc` on the filespec. */
  description?: string;
}

/**
 * What callers pass to create an attachment. `name` may be omitted only
 * when `data` carries one itself (a browser `File`); normalization throws
 * `InvalidArg` when no name is resolvable — a PDF filespec requires one.
 * `mimeType` is stored as declared (attachment types cannot be reliably
 * sniffed); it falls back to the Blob's type, else the writer stores
 * `application/octet-stream`.
 */
export interface AttachmentFileSource {
  data: Uint8Array | Blob;
  name?: string;
  mimeType?: string;
  description?: string;
}

/** Read-side projection of an embedded file stream (`/EF` + `/Params`). */
export interface AttachmentFileInfo extends AttachmentFileBase {
  /** `/Params /Size` — decoded size in bytes. */
  size?: number;
  /** `/Params /CheckSum` — MD5 of the decoded bytes, lowercase hex. */
  checksum?: string;
  /** `/Params /CreationDate` — PDF date string. */
  creationDate?: string;
}

/**
 * Durable address of a document-level embedded file: its name-tree KEY.
 * Keys are unique within the tree by construction (ISO 32000 §7.9.6), so
 * — unlike annotations — no weak/index tier and no revision validation is
 * needed. A discriminated union so future ref kinds can be added without
 * a breaking change (the `AnnotationRef` pattern).
 *
 * The key usually equals the file's display `name` (`/UF`) — always, for
 * engine-created attachments — but foreign PDFs may diverge, and `/UF`
 * values may collide while keys cannot. Address by `key`; display `name`.
 */
export type EmbeddedFileRef = { kind: 'key'; key: string };

/** One entry of the document-level `/EmbeddedFiles` name tree. */
export interface EmbeddedFileItem extends AttachmentFileInfo {
  /** The name-tree key — the durable address for download/remove. */
  key: string;
  /**
   * Position in name-tree (sorted) order — display metadata, NOT an
   * address: both create and delete shift indices. Address by `key`.
   */
  index: number;
}

/**
 * A downloaded attachment: the payload symmetric counterpart of
 * {@link AttachmentFileSource} — what you put in is what you get out.
 */
export interface AttachmentContent {
  bytes: Uint8Array;
  name: string;
  mimeType?: string;
}
