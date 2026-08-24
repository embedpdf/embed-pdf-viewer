'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

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

const FADE = 28;

/**
 * Only the heading list scrolls; everything in `footer` stays pinned.
 *
 * A long page (Stage is 16 sections) used to overflow the whole rail, which
 * put a scrollbar down the side and pushed the markdown actions and the
 * feedback prompt below the fold, where nobody found them. The list gets the
 * leftover height and scrolls inside itself instead, its scrollbar traded for
 * a fade at whichever edge still has content behind it.
 */
function useRailScroll(items: TocItem[], activeId: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const overflowing = element.scrollHeight > element.clientHeight + 1;
      setEdges({
        top: overflowing && element.scrollTop > 4,
        bottom:
          overflowing && element.scrollTop + element.clientHeight < element.scrollHeight - 4,
      });
    };

    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [items]);

  // Follow the reader: once the list scrolls, the highlighted section would
  // otherwise drift out of the rail's viewport. Never smooth — this fires
  // during page scrolling, and an animation here fights the reader.
  //
  // Positions come from rects, not offsetTop: the link's offsetParent is the
  // sticky <aside>, so offsetTop carries the heading and padding above this
  // container. That inflation made scrolling DOWN over-correct and scrolling
  // UP silently fail to bring the earlier section back into view.
  useEffect(() => {
    const element = ref.current;
    if (!element || !activeId) return;
    const link = element.querySelector<HTMLElement>(`a[href="#${CSS.escape(activeId)}"]`);
    if (!link) return;

    const top = link.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
    const bottom = top + link.offsetHeight;
    if (top < element.scrollTop + FADE) {
      element.scrollTop = Math.max(0, top - FADE);
    } else if (bottom > element.scrollTop + element.clientHeight - FADE) {
      element.scrollTop = bottom - element.clientHeight + FADE;
    }
  }, [activeId]);

  const mask =
    edges.top || edges.bottom
      ? `linear-gradient(to bottom, transparent 0px, #000 ${edges.top ? `${FADE}px` : '0px'}, #000 calc(100% - ${
          edges.bottom ? `${FADE}px` : '0px'
        }), transparent 100%)`
      : undefined;

  return { ref, mask };
}

/**
 * The "On this page" rail. Purely presentational — pair it with
 * {@link useSectionSpy} and put site extras (markdown actions, the feedback
 * widget) in `footer`, which stays visible however long the page is.
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
  const { ref, mask } = useRailScroll(items, activeId);

  if (items.length === 0) return null;

  return (
    <aside className="sticky top-[84px] hidden max-h-[calc(100vh-84px)] w-[232px] shrink-0 flex-col self-start py-11 xl:flex">
      <p className="font-display mb-3.5 shrink-0 text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-[var(--dk-muted)]">
        On this page
      </p>
      <div
        ref={ref}
        className="dk-rail-scroll min-h-0 flex-1 overflow-y-auto"
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      >
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
      </div>
      {footer ? <div className="shrink-0">{footer}</div> : null}
    </aside>
  );
}
