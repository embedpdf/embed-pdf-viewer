'use client';

import {
  Feedback,
  PageMarkdownActions,
  Toc as KitToc,
  useSectionSpy,
  type TocItem,
} from '@embedpdf/docs-kit';

export type { TocItem };

/**
 * The CloudPDF docs rail: kit Toc (with the DOM-derived fallback for
 * component-emitted sections like the API reference) plus the shared
 * feedback widget posting through this site's /api/docs/feedback forwarder.
 */
export function Toc({ toc }: { toc?: TocItem[] }) {
  const { items, activeId } = useSectionSpy(toc);
  const revision = process.env.NEXT_PUBLIC_GIT_SHA ?? 'dev';

  return (
    <KitToc
      items={items}
      activeId={activeId}
      footer={
        <>
          <PageMarkdownActions />
          <Feedback site="cloudpdf" sectionId={activeId} revision={revision} variant="compact" />
        </>
      }
    />
  );
}
