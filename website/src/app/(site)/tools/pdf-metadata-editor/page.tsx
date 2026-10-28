import type { Metadata } from 'next';

import { METADATA_COPY } from '@/components/tools/content';
import { MetadataPageTool } from '@/components/tools/metadata/metadata-page-tool';
import { ToolPage } from '@/components/tools/shared/tool-page';

export const metadata: Metadata = {
  title: METADATA_COPY.metaTitle,
  description: METADATA_COPY.metaDescription,
  alternates: { canonical: '/tools/pdf-metadata-editor' },
};

export default function PdfMetadataEditorPage() {
  return (
    <ToolPage copy={METADATA_COPY}>
      <MetadataPageTool />
    </ToolPage>
  );
}
