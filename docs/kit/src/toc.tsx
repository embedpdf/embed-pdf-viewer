'use client';

import { useEffect, useState, type ReactNode } from 'react';

export type TocItem = {
  value: ReactNode;
  id: string;
  depth: number;
};

/**
 * Track the section the reader is in, and resolve the items to show.
 *
 * Nextra builds the TOC from markdown headings only, so pages whose sections
 * are emitted by a component (an API reference, most of all) arrive with an
 * empty toc — the hook falls back to the headings actually rendered into the
 * article. Returns the resolved items plus the active heading id, which
 * doubles as the feedback widget's `sectionId`.
 */
export function useSectionSpy(toc?: TocItem[]): { items: TocItem[]; activeId: string | null } {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [derived, setDerived] = useState<TocItem[]>([]);

  useEffect(() => {
    if (toc && toc.length > 0) return;
    const headings = document.querySelectorAll<HTMLHeadingElement>(
      'article h2[id], article h3[id]',
    );
    setDerived(
      [...headings].map((heading) => {
        const label = heading.cloneNode(true) as HTMLHeadingElement;
        label.querySelector('a[aria-label]')?.remove();
        return {
          id: heading.id,
          value: label.textContent?.trim() ?? '',
          depth: Number(heading.tagName[1]),
        };
      }),
    );
  }, [toc]);

  const items = toc && toc.length > 0 ? toc : derived;

  useEffect(() => {
    if (items.length === 0) return;
    const ids = items.map((item) => item.id);

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
  }, [items]);

  return { items, activeId };
}

/**
 * The "On this page" rail. Purely presentational — pair it with
 * {@link useSectionSpy} and put site extras (markdown actions, the feedback
 * widget) in `footer`.
 */
export function Toc({
  items,
  activeId,
  footer,
}: {
  items: TocItem[];
  activeId: string | null;
  footer?: ReactNode;
}) {
  if (items.length === 0) return null;

  return (
    <aside className="sticky top-[84px] hidden max-h-[calc(100vh-84px)] w-[232px] shrink-0 self-start overflow-y-auto py-11 xl:block">
      <p className="font-display mb-3.5 text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-[var(--dk-muted)]">
        On this page
      </p>
      <ul className="flex flex-col gap-0.5 border-l-2 border-[var(--dk-border)]">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id} style={{ paddingLeft: `${(item.depth - 2) * 12}px` }}>
              <a
                href={`#${item.id}`}
                className={`-ml-0.5 block border-l-2 py-1.5 pl-3.5 font-sans text-[13.5px] leading-[1.4] no-underline transition-colors ${
                  active
                    ? 'border-[var(--dk-accent)] font-bold text-[var(--dk-accent)]'
                    : 'border-transparent text-[var(--dk-muted)] hover:text-[var(--dk-heading)]'
                }`}
              >
                {item.value}
              </a>
            </li>
          );
        })}
      </ul>
      {footer}
    </aside>
  );
}
