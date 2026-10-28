import type { Metadata } from 'next';

import { MERGE_COPY } from '@/components/tools/content';
import { MergeTool } from '@/components/tools/merge/merge-tool';
import { ToolPage } from '@/components/tools/shared/tool-page';

export const metadata: Metadata = {
  title: MERGE_COPY.metaTitle,
  description: MERGE_COPY.metaDescription,
  alternates: { canonical: '/tools/pdf-merge' },
};

export default function PdfMergePage() {
  return (
    <ToolPage copy={MERGE_COPY}>
      <MergeTool />
    </ToolPage>
  );
}
