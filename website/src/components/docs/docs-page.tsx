'use client';

import { useSectionSpy, type TocItem } from '@embedpdf/docs-kit';
import type { ReactNode } from 'react';

import { Feedback } from './feedback';
import { Toc } from './toc';

export function DocsPage({
  children,
  toc,
  revision,
}: {
  children: ReactNode;
  toc?: TocItem[];
  revision: string;
}) {
  // The kit hook also derives items from rendered headings when the MDX toc
  // is empty (component-emitted sections), so activeId works everywhere.
  const { items, activeId } = useSectionSpy(toc);
  const hasToc = items.length > 0;

  return (
    <div className="flex gap-[clamp(28px,4vw,60px)]">
      <article className="prose-embedpdf min-w-0 flex-1 pb-20 pt-9">
        {children}
        <Feedback
          sectionId={activeId}
          revision={revision}
          variant="full"
          className={hasToc ? 'xl:hidden' : ''}
        />
      </article>
      <Toc toc={items} activeId={activeId} revision={revision} />
    </div>
  );
}
