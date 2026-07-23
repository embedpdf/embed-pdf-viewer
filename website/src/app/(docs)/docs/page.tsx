import { DocsOverview } from '@/components/docs/docs-overview';
import { buildDocsPageMetadata, DOCS_OVERVIEW_PRESENTATION } from '@/lib/docs-page';

export const metadata = buildDocsPageMetadata(DOCS_OVERVIEW_PRESENTATION, { ogType: 'website' });

export default function DocsOverviewPage() {
  return <DocsOverview />;
}
