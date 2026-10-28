'use client';

import { ATTACHMENTS_COPY } from '../content';
import { AttachmentsTool } from './attachments-tool';
import { SingleFileTool } from '../shared/single-file';

/** The attachments tool as its page shows it: one PDF in, then its files. */
export function AttachmentsPageTool() {
  return (
    <SingleFileTool drop={ATTACHMENTS_COPY.drop}>
      {(file) => <AttachmentsTool file={file} />}
    </SingleFileTool>
  );
}
