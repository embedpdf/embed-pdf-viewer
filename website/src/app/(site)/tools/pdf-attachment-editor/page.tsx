import type { Metadata } from 'next';

import { AttachmentsPageTool } from '@/components/tools/attachments/attachments-page-tool';
import { ATTACHMENTS_COPY } from '@/components/tools/content';
import { ToolPage } from '@/components/tools/shared/tool-page';

export const metadata: Metadata = {
  title: ATTACHMENTS_COPY.metaTitle,
  description: ATTACHMENTS_COPY.metaDescription,
  alternates: { canonical: '/tools/pdf-attachment-editor' },
};

export default function PdfAttachmentEditorPage() {
  return (
    <ToolPage copy={ATTACHMENTS_COPY}>
      <AttachmentsPageTool />
    </ToolPage>
  );
}
