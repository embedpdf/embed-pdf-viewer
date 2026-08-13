import { Toc as KitToc, type TocItem } from '@embedpdf/docs-kit';

import { Feedback } from './feedback';
import { PageMarkdownActions } from './page-markdown-actions';

export type { TocItem };

export function Toc({
  toc,
  activeId,
  revision,
}: {
  toc?: TocItem[];
  activeId: string | null;
  revision: string;
}) {
  return (
    <KitToc
      items={toc ?? []}
      activeId={activeId}
      footer={
        <>
          <PageMarkdownActions />
          <Feedback sectionId={activeId} revision={revision} variant="compact" />
        </>
      }
    />
  );
}
