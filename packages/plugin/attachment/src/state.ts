/**
 * The attachment page's State table as code: what `useAttachmentState()`
 * returns, and the same fields in every other framework. Reading the state
 * loads the attachments (`ensure`): the first reader of a document starts
 * the read.
 */
import { defineState } from '@embedpdf/core';

import { AttachmentToken } from './contract';

export const attachmentState = defineState(AttachmentToken, {
  read: (attachment) => ({
    files: attachment.list(),
    status: attachment.getStatus(),
    canAdd: attachment.canAdd(),
    canDownload: attachment.canDownload(),
  }),
  empty: {
    files: [],
    status: 'idle',
    canAdd: false,
    canDownload: false,
  },
  ensure: (attachment) => attachment.ensureLoaded(),
});
