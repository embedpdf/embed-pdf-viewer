'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { Feedback } from './feedback';
import { Toc, type TocItem } from './toc';

export function DocsPage({
  children,
  toc,
  revision,
}: {
  children: ReactNode;
  toc?: TocItem[];
  revision: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!toc || toc.length === 0) return;
    const ids = toc.map((item) => item.id);

    function spy() {
      const top = window.scrollY + 140;
      let current: string | null = ids[0] ?? null;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && element.offsetTop <= top) current = id;
      }
      setActiveId(current);
    }

    spy();
    window.addEventListener('scroll', spy, { passive: true });
    window.addEventListener('resize', spy);
    return () => {
      window.removeEventListener('scroll', spy);
      window.removeEventListener('resize', spy);
    };
  }, [toc]);

  const hasToc = Boolean(toc?.length);

  return (
    <div className="flex gap-[clamp(28px,4vw,60px)]">
      <article className="prose-embedpdf min-w-0 flex-1 pb-20 pt-9">
        {children}
        <Feedback
          site="embedpdf"
          sectionId={activeId}
          revision={revision}
          variant="full"
          className={hasToc ? 'xl:hidden' : ''}
        />
      </article>
      <Toc toc={toc} activeId={activeId} revision={revision} />
    </div>
  );
}
