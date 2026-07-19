import type { EmbeddedFileItem, EmbeddedFileRef } from '../dto/Attachment';

/**
 * Cloud manifest coherence pins for an attachment mutation — the
 * `MetadataCache` pattern: the layer doc version advanced, and the
 * `attachmentsVersion` pin re-keys the immutable `/attachments@…` and
 * `/attachment-files/…@…` leaves.
 */
export interface AttachmentsCache {
  previousDocVersion: number;
  docVersion: number;
  attachmentsVersion: number;
}

/**
 * Result of creating a document-level embedded file. `created` is the
 * fully materialised name-tree entry, read back after the write — its
 * `key` is the durable ref for later download/delete, and its `index`
 * reflects the name-sorted position (creating shifts other indices; keys
 * never move).
 */
export interface AttachmentCreateResult {
  created: EmbeddedFileItem;
  /** Cloud-only manifest coherence pins; `null` for local engines. */
  cache: AttachmentsCache | null;
}

/**
 * Result of deleting a document-level embedded file. `deleted` is the
 * durable ref that stopped resolving (the attachment analog of
 * `AnnotationDeleteResult.deleted` — always known here, since attachment
 * refs are never weak).
 */
export interface AttachmentDeleteResult {
  deleted: EmbeddedFileRef;
  /** Cloud-only manifest coherence pins; `null` for local engines. */
  cache: AttachmentsCache | null;
}
