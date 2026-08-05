'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type TableOfContentsSection = Readonly<{
  id: string;
  title: string;
}>;

export function LegalTableOfContents({
  sections,
  title,
}: {
  sections: readonly TableOfContentsSection[];
  title: string;
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');
  const listRef = useRef<HTMLOListElement>(null);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());

  useEffect(() => {
    let animationFrame = 0;

    const updateActiveSection = () => {
      const activationLine = 140;
      let nextActiveId = sections[0]?.id ?? '';
      const pageBottom = window.scrollY + window.innerHeight;
      const documentBottom = document.documentElement.scrollHeight;

      if (pageBottom >= documentBottom - 4) {
        nextActiveId = sections.at(-1)?.id ?? nextActiveId;
      } else {
        for (const section of sections) {
          const element = document.getElementById(section.id);
          if (!element || element.getBoundingClientRect().top > activationLine) break;
          nextActiveId = section.id;
        }
      }

      setActiveId((current) => (current === nextActiveId ? current : nextActiveId));
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    };

    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [sections]);

  useEffect(() => {
    const list = listRef.current;
    const activeLink = linkRefs.current.get(activeId);
    if (!list || !activeLink) return;

    const listBounds = list.getBoundingClientRect();
    const linkBounds = activeLink.getBoundingClientRect();

    if (linkBounds.top < listBounds.top) {
      list.scrollBy({ top: linkBounds.top - listBounds.top - 8, behavior: 'smooth' });
    } else if (linkBounds.bottom > listBounds.bottom) {
      list.scrollBy({ top: linkBounds.bottom - listBounds.bottom + 8, behavior: 'smooth' });
    }
  }, [activeId]);

  return (
    <nav
      aria-label={`${title} contents`}
      className="border-cp-border rounded-2xl border bg-white p-5 shadow-[0_16px_42px_-34px_rgba(10,26,77,0.32)] min-[960px]:sticky min-[960px]:top-[108px] min-[960px]:flex min-[960px]:max-h-[calc(100dvh-132px)] min-[960px]:flex-col"
    >
      <p className="font-display text-cp-navy text-sm font-extrabold uppercase tracking-[0.1em]">
        On this page
      </p>
      <ol
        ref={listRef}
        className="mt-4 grid gap-1.5 min-[960px]:min-h-0 min-[960px]:overflow-y-auto min-[960px]:overscroll-contain min-[960px]:pr-1"
      >
        {sections.map((section, index) => {
          const active = activeId === section.id;

          return (
            <li key={section.id}>
              <Link
                ref={(element) => {
                  if (element) linkRefs.current.set(section.id, element);
                  else linkRefs.current.delete(section.id);
                }}
                href={`#${section.id}`}
                aria-current={active ? 'location' : undefined}
                onClick={() => setActiveId(section.id)}
                className={`flex gap-2 rounded-lg px-2.5 py-2 text-sm no-underline transition-colors ${
                  active
                    ? 'bg-cp-surface text-cp-blue font-semibold'
                    : 'text-cp-muted hover:bg-cp-surface hover:text-cp-blue font-medium'
                }`}
              >
                <span aria-hidden="true" className={active ? 'text-cp-blue' : 'text-[#9AA8C4]'}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{section.title}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
