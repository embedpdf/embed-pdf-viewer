import type { AttachmentFileSource, AttachmentList, AttachmentRef } from '../dto/Attachment';
import type {
  AttachmentCreateResult,
  AttachmentDeleteResult,
} from '../mutation/AttachmentMutationResults';
import type { WriteOptions } from '../mutation/WriteOptions';
import { AbortablePromise } from '../promise/AbortablePromise';

/**
 * Document-level attachments: the catalog's `/EmbeddedFiles` name tree
 * (ISO 32000 §7.11.4). Exposed via `DocumentHandle.attachments`.
 *
 * Addressing is by name-tree key (`AttachmentRef`), unique by
 * construction (see the ref's doc comment). `list()` returns metadata only;
 * bytes leave the engine exclusively through {@link download}. The
 * annotation-level counterpart is
 * `PageAnnotationsService.downloadResource(ref, 'file')`, which answers the
 * same way: the bytes, the name and type being what the listing says.
 *
 * `create` and `delete` are each one op of a change (`attachments.create`,
 * `attachments.delete`): their `opId` undoes them, and an undo of a delete
 * brings the same file back (`attachments.restored`).
 */
export interface DocumentAttachmentsService {
  /** Snapshot of the `/EmbeddedFiles` name tree, in tree (key-sorted) order. */
  list(): AbortablePromise<AttachmentList>;
  /**
   * Decode and return one embedded file's bytes. Throws
   * `EngineError(NotFound)` when no entry has the ref's key,
   * `EngineError(InvalidArg)` when the entry has no embedded file stream,
   * and `EngineError(PayloadTooLarge)` when the file decodes to more than
   * `ATTACHMENT_LIMITS.decodedBytes` on an engine that holds it in memory.
   */
  download(ref: AttachmentRef): AbortablePromise<Uint8Array>;
  /**
   * Create an embedded file in the name tree. The file's `name` becomes
   * the tree key (`/UF` = `/F` = key); a duplicate key rejects with
   * `EngineError(InvalidArg)` — rename and retry. A mutation: layer
   * sessions persist an artifact and an `attachments.created` event is
   * published. Note the tree is key-sorted, so other entries' indices
   * may shift; keys never move.
   */
  create(
    file: AttachmentFileSource,
    options?: WriteOptions,
  ): AbortablePromise<AttachmentCreateResult>;
  /**
   * Delete an embedded file from the name tree. Unlinks the entry only —
   * the stream bytes remain in the document until a full rewrite (the
   * immutable-base/layer model). Throws `EngineError(NotFound)` for an
   * unknown key. A mutation: layer sessions persist an artifact and an
   * `attachments.deleted` event is published.
   */
  delete(ref: AttachmentRef, options?: WriteOptions): AbortablePromise<AttachmentDeleteResult>;
}
