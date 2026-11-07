import type { Metadata } from 'next';

import { OUTLINE_COPY } from '@/components/tools/content';
import { BookmarksPageTool } from '@/components/tools/outline/bookmarks-page-tool';
import { ToolPage } from '@/components/tools/shared/tool-page';

export const metadata: Metadata = {
  title: OUTLINE_COPY.metaTitle,
  description: OUTLINE_COPY.metaDescription,
  alternates: { canonical: '/tools/pdf-outline-editor' },
};

export default function PdfOutlineEditorPage() {
  return (
    <ToolPage copy={OUTLINE_COPY}>
      <BookmarksPageTool />
    </ToolPage>
  );
}
