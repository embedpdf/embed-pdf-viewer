import type { ReactNode } from 'react';

import { Feedback } from './feedback';
import { PageMarkdownActions } from './page-markdown-actions';

export type TocItem = {
  value: ReactNode;
  id: string;
  depth: number;
};

export function Toc({
  toc,
  activeId,
  revision,
}: {
  toc?: TocItem[];
  activeId: string | null;
  revision: string;
}) {
  if (!toc || toc.length === 0) return null;

  return (
    <aside className="sticky top-[84px] hidden max-h-[calc(100vh-84px)] w-[232px] shrink-0 self-start overflow-y-auto py-11 xl:block">
      <p className="font-display text-ep-soft mb-3.5 text-[11.5px] font-extrabold uppercase tracking-[0.1em]">
        On this page
      </p>
      <ul className="border-ep-borderSoft flex flex-col gap-0.5 border-l-2">
        {toc.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id} style={{ paddingLeft: `${(item.depth - 2) * 12}px` }}>
              <a
                href={`#${item.id}`}
                className={`-ml-0.5 block border-l-2 py-1.5 pl-3.5 font-sans text-[13.5px] leading-[1.4] no-underline transition-colors ${
                  active
                    ? 'border-ep-blue text-ep-blue font-bold'
                    : 'text-ep-soft hover:text-ep-navy border-transparent'
                }`}
              >
                {item.value}
              </a>
            </li>
          );
        })}
      </ul>
      <PageMarkdownActions />
      <Feedback site="embedpdf" sectionId={activeId} revision={revision} variant="compact" />
    </aside>
  );
}
