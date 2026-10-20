/** @embedpdf/plugin-attachment/contract: the public attachment vocabulary. */
import type { EventHook, EventOrigin, OperationOptions, ResourceStatus } from '@embedpdf/core';
import type {
  AnnotationRef,
  AttachmentContent,
  AttachmentFileInfo,
  AttachmentFileSource,
  AttachmentRef,
} from '@embedpdf/engine-core/runtime';

export { AttachmentToken } from './token';
export { displayNameOf } from './names';
export type {
  AnnotationRef,
  AttachmentContent,
  AttachmentFileInfo,
  AttachmentFileSource,
  AttachmentRef,
};

/**
 * Where a file lives: in the document's attachments (`/EmbeddedFiles`),
 * addressed by its key, or in a file attachment annotation on a page,
 * addressed by the annotation (whose ref names the page).
 */
export type AttachedFileHome =
  | { readonly kind: 'document'; readonly ref: AttachmentRef }
  | { readonly kind: 'page'; readonly ref: AnnotationRef };

/** One file the document carries, from either home: its name, type, description, size, checksum and dates. */
export interface AttachedFile extends Readonly<AttachmentFileInfo> {
  /** Its key in a list: the same as long as the file is where it is. */
  readonly id: string;
  readonly home: AttachedFileHome;
}

/**
 * A confirmed change of the document's attachments, whoever made it: this
 * session or another. Fires after the list shows it. A page's file is an
 * annotation: its changes are the annotation plugin's events.
 */
export interface AttachmentsChangedEvent {
  /** `restored`: an undo brought a removed file back. */
  readonly type: 'added' | 'removed' | 'restored';
  /** The files it touched; for a removal, as they were. */
  readonly files: readonly AttachedFile[];
  readonly origin: EventOrigin;
}

/** The document's attachments were read from the engine, first or again. */
export interface AttachmentsResyncedEvent {
  readonly files: readonly AttachedFile[];
}

export interface AttachmentCapability {
  /**
   * Every file the document carries: its attachments, in the order the
   * document keeps them (by name), then the files of its file attachment
   * annotations, in page order. This session's pending adds and removes
   * show. Reference-stable until it changes. The attachments are missing
   * until the first read lands; the pages' files come with the annotation
   * plugin.
   */
  list(): readonly AttachedFile[];
  /** One file by its `id`, or `null`. */
  get(id: string): AttachedFile | null;
  /** Whether a change to it waits for the engine: an add of an attachment, or a write to its annotation. */
  isPending(file: AttachedFile): boolean;
  /** Load state of the attachments: `idle` until `ensureLoaded()` asks, then `loading` → `ready`, or `forbidden` / `error`. */
  getStatus(): ResourceStatus;
  /**
   * Read the attachments unless they are read or being read: nothing reads
   * them when a document opens. Resolves once they landed and `onResynced`
   * fired. Rejects `operation-cancelled` or `instance-closed`; after a
   * failure it reads again.
   */
  ensureLoaded(options?: OperationOptions): Promise<void>;
  /** Read them again. Rarely needed: the event stream keeps them current. */
  refresh(options?: OperationOptions): Promise<void>;

  /** Whether this session may take files out (`doc.download`): `download()`. */
  canDownload(): boolean;
  /** Whether this session may add and remove attachments (`doc.attachments.modify`). */
  canAdd(): boolean;
  /** Whether this session may remove this file: `canAdd()` for an attachment, the annotation plugin's `canDelete()` for a page's file. */
  canRemove(file: AttachedFile): boolean;

  /**
   * Attach files to the document, as one change: one step of the history.
   * A `File` brings its name and type; bytes need a `name`. A name the
   * document has already gets a number, `notes (2).txt`, so nothing is
   * replaced. The files show at once, pending, and resolve with the engine's
   * records, in order. Fires `onChanged`. Rejects `permission-denied`,
   * `invalid-input` for bytes without a name, `operation-cancelled` or
   * `instance-closed`.
   */
  add(
    files: readonly AttachmentFileSource[],
    options?: OperationOptions,
  ): Promise<readonly AttachedFile[]>;
  /**
   * Remove a file, as one step of the history: an attachment, or a page's
   * file attachment annotation (through the annotation plugin). It goes at
   * once; an undo brings it back. Rejects `permission-denied`, `not-found`
   * for a file the document doesn't have, `operation-cancelled` or
   * `instance-closed`.
   */
  remove(file: AttachedFile, options?: OperationOptions): Promise<void>;
  /**
   * The file's bytes, ready to save: its name cleaned (`displayNameOf`) and
   * its type. A pending add is waited for. Rejects `permission-denied`
   * without `doc.download`, `not-found`, `invalid-input` for a file that
   * decodes past the engine's limit (`details.limit` on the local engine),
   * `operation-cancelled` or `instance-closed`.
   */
  download(file: AttachedFile, options?: OperationOptions): Promise<AttachmentContent>;
  /** Go to a page's file: select its annotation and bring it into view. Does nothing for an attachment. */
  reveal(file: AttachedFile): void;

  /** A confirmed change of the attachments, whoever made it. */
  readonly onChanged: EventHook<AttachmentsChangedEvent>;
  /** The attachments were read, first or again. Fires no per-file `onChanged`. */
  readonly onResynced: EventHook<AttachmentsResyncedEvent>;
}
