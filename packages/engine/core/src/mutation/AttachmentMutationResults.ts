import type { MutationMeta } from './MutationMeta';
import type { Attachment, AttachmentRef } from '../dto/Attachment';

/**
 * The `meta` of an attachment write: the attachments it created or deleted.
 * On the cloud, `cacheDelta` advances `docVersion` and `attachmentsVersion`
 * (which re-keys the `/attachments@…` and `/attachment-files/…@…` leaves)
 * and no per-page pin.
 */
export interface AttachmentMutationMeta extends MutationMeta {
  changed: AttachmentRef[];
}

/**
 * Result of creating a document-level embedded file: the new attachment,
 * read back after the write. Its `index` reflects the name-sorted position
 * (creating shifts other indices; refs never move).
 */
export interface AttachmentCreateResult {
  attachment: Attachment;
  meta: AttachmentMutationMeta;
}

/** A delete: nothing exists after it, so only `meta`. */
export interface AttachmentDeleteResult {
  meta: AttachmentMutationMeta;
}

/**
 * What a delete removed, as its `attachments.deleted` event names it for
 * listeners that didn't make the call.
 */
export function deletedAttachmentOf(result: AttachmentDeleteResult): AttachmentRef | null {
  return result.meta.changed[0] ?? null;
}
