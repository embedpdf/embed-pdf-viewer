'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

export type TocItem = {
  value: ReactNode;
  id: string;
  depth: number;
};

function Feedback() {
  const [picked, setPicked] = useState<'yes' | 'no' | null>(null);

  return (
    <div className="border-cp-border mt-[26px] border-t pt-[22px]">
      <div className="font-display text-cp-navy mb-[11px] text-[13px] font-bold leading-[1.4]">
        Was this page helpful?
      </div>
      <div className="flex gap-2">
        {(['yes', 'no'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setPicked(value)}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] border font-sans text-[13px] font-bold transition-colors ${
              picked === value
                ? 'border-cp-blue bg-cp-surface text-cp-blue'
                : 'border-cp-border text-cp-muted hover:text-cp-blue bg-white hover:border-[#CFE0FF] hover:bg-[#F4F8FF]'
            }`}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {value === 'yes' ? (
                <>
                  <path d="M7 10v12" />
                  <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z" />
                </>
              ) : (
                <>
                  <path d="M17 14V2" />
                  <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z" />
                </>
              )}
            </svg>
            {value === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toc({ toc }: { toc?: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!toc || toc.length === 0) return;
    const ids = toc.map((item) => item.id);

    function spy() {
      const top = window.scrollY + 140;
      let current: string | null = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= top) current = id;
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

  if (!toc || toc.length === 0) return null;

  return (
    <aside className="sticky top-[84px] hidden max-h-[calc(100vh-84px)] w-[232px] shrink-0 self-start overflow-y-auto py-11 xl:block">
      <p className="font-display text-cp-muted mb-3.5 text-[11.5px] font-extrabold uppercase tracking-[0.1em]">
        On this page
      </p>
      <ul className="border-cp-borderSoft flex flex-col gap-0.5 border-l-2">
        {toc.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id} style={{ paddingLeft: `${(item.depth - 2) * 12}px` }}>
              <a
                href={`#${item.id}`}
                className={`-ml-0.5 block border-l-2 py-1.5 pl-3.5 font-sans text-[13.5px] leading-[1.4] no-underline transition-colors ${
                  active
                    ? 'border-cp-blue text-cp-blue font-bold'
                    : 'text-cp-muted hover:text-cp-navy border-transparent'
                }`}
              >
                {item.value}
              </a>
            </li>
          );
        })}
      </ul>
      <Feedback />
    </aside>
  );
}
