/**
 * The attachment page's State table as code: what `useAttachmentState()`
 * returns, and the same fields in every other framework. Reading the state
 * loads the attachments (`ensure`): the first reader of a document starts
 * the read.
 */
import { defineState, type ResourceStatus } from '@embedpdf/core';

import { AttachmentToken, type AttachedFile } from './contract';

/** The document's files, the selected ones, whether they're read, and what this session may do. */
export interface AttachmentState {
  /** Every file the document carries: its attachments, then the files of its file attachment annotations. */
  readonly files: readonly AttachedFile[];
  /** The selected files, in the order they were selected. */
  readonly selected: readonly AttachedFile[];
  /** `idle` until something reads the state, then `loading` and `ready`, or `forbidden` or `error`. */
  readonly status: ResourceStatus;
  /** Whether this session may add and remove attachments (`doc.attachments.modify`). */
  readonly canAdd: boolean;
  /** Whether this session may take files out (`doc.download`). */
  readonly canDownload: boolean;
}

export const attachmentState = defineState(AttachmentToken, {
  read: (attachment): AttachmentState => ({
    files: attachment.list(),
    selected: attachment.getSelected(),
    status: attachment.getStatus(),
    canAdd: attachment.canAdd(),
    canDownload: attachment.canDownload(),
  }),
  empty: {
    files: [],
    selected: [],
    status: 'idle',
    canAdd: false,
    canDownload: false,
  },
  ensure: (attachment) => attachment.ensureLoaded(),
});
