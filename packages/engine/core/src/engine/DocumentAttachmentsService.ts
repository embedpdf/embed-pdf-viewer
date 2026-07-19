import type {
  AttachmentContent,
  AttachmentFileSource,
  EmbeddedFileItem,
  EmbeddedFileRef,
} from '../dto/Attachment';
import type {
  AttachmentCreateResult,
  AttachmentDeleteResult,
} from '../mutation/AttachmentMutationResults';
import { AbortablePromise } from '../promise/AbortablePromise';

/**
 * Document-level attachments: the catalog's `/EmbeddedFiles` name tree
 * (ISO 32000 §7.11.4). Exposed via `DocumentHandle.attachments`.
 *
 * Addressing is by name-tree KEY (`EmbeddedFileRef`) — unique by
 * construction, so there is no weak/index tier and no revision to
 * validate (see the ref's doc comment). `list()` returns metadata only;
 * bytes leave the engine exclusively through {@link download}. The
 * annotation-level counterpart is
 * `PageAnnotationsService.downloadFile(ref)`.
 *
 * `create`/`delete` are optional (the `downloadLayer?` pattern) while
 * transports ship — feature-detect with `attachments.create !== undefined`.
 */
export interface DocumentAttachmentsService {
  /** Snapshot of the `/EmbeddedFiles` name tree, in tree (key-sorted) order. */
  list(): AbortablePromise<EmbeddedFileItem[]>;
  /**
   * Decode and return one embedded file's bytes plus the metadata needed
   * to hand it to a user (name, mime type). Throws
   * `EngineError(NotFound)` when no entry has the ref's key and
   * `EngineError(InvalidArg)` when the entry has no embedded file stream.
   */
  download(ref: EmbeddedFileRef): AbortablePromise<AttachmentContent>;
  /**
   * Create an embedded file in the name tree. The file's `name` becomes
   * the tree key (`/UF` = `/F` = key); a duplicate key rejects with
   * `EngineError(InvalidArg)` — rename and retry. A MUTATION: layer
   * sessions persist an artifact and an `attachment.created` event is
   * published. Note the tree is key-sorted, so other entries' indices
   * may shift; keys never move.
   */
  create?(file: AttachmentFileSource): AbortablePromise<AttachmentCreateResult>;
  /**
   * Delete an embedded file from the name tree. Unlinks the entry only —
   * the stream bytes remain in the document until a full rewrite (the
   * immutable-base/layer model). Throws `EngineError(NotFound)` for an
   * unknown key. A MUTATION: layer sessions persist an artifact and an
   * `attachment.deleted` event is published.
   */
  delete?(ref: EmbeddedFileRef): AbortablePromise<AttachmentDeleteResult>;
}
