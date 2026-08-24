'use client';

import {
  ArrowDown01Icon,
  Cancel01Icon,
  ListViewIcon,
  Menu01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useState, type ReactNode } from 'react';

import { useSectionSpy, type TocItem } from './toc';

/**
 * Docs navigation for phones, where both rails are hidden.
 *
 * The desktop sidebar lives on the left and the section rail on the right, so
 * the two controls here keep those sides: the tree slides in from the left,
 * the section list drops down under its own button. Mount it ABOVE the padded
 * docs container so the bar itself can run full-bleed.
 *
 * Remount it on navigation (`key={pathname}`) — that re-derives the section
 * list from the new article and closes whatever was open.
 */
export function DocsMobileBar({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [panel, setPanel] = useState<'none' | 'tree' | 'sections'>('none');
  const { items, activeId } = useSectionSpy();

  useEffect(() => {
    if (panel === 'none') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel('none');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  // The tree is a full-height overlay; letting the page scroll behind it
  // strands the reader somewhere else when it closes.
  useEffect(() => {
    if (panel !== 'tree') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [panel]);

  return (
    <>
      <div className="sticky top-[84px] z-40 border-b border-[var(--dk-border)] bg-white/[0.92] backdrop-blur-[10px] md:hidden">
        <div className="flex items-center gap-2 px-[clamp(20px,4vw,78px)] py-2.5">
          <button
            type="button"
            onClick={() => setPanel(panel === 'tree' ? 'none' : 'tree')}
            aria-expanded={panel === 'tree'}
            className="-ml-2 flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 font-sans text-[14px] font-semibold text-[var(--dk-heading)] transition-colors hover:bg-[var(--dk-accent-surface)]"
          >
            <HugeiconsIcon
              icon={Menu01Icon}
              size={18}
              strokeWidth={2.2}
              className="shrink-0 text-[var(--dk-accent)]"
            />
            <span className="truncate">{label}</span>
          </button>

          {items.length > 0 ? (
            <button
              type="button"
              onClick={() => setPanel(panel === 'sections' ? 'none' : 'sections')}
              aria-expanded={panel === 'sections'}
              className="-mr-2 ml-auto flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 font-sans text-[13.5px] font-semibold text-[var(--dk-muted)] transition-colors hover:bg-[var(--dk-accent-surface)] hover:text-[var(--dk-heading)]"
            >
              <HugeiconsIcon icon={ListViewIcon} size={16} strokeWidth={2.2} />
              On this page
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={15}
                strokeWidth={2.4}
                className={`transition-transform ${panel === 'sections' ? 'rotate-180' : ''}`}
              />
            </button>
          ) : null}
        </div>

        {panel === 'sections' ? (
          <SectionDropdown items={items} activeId={activeId} onPick={() => setPanel('none')} />
        ) : null}
      </div>

      {panel === 'tree' ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setPanel('none')}
            className="dk-anim-fade absolute inset-0 h-full w-full cursor-default bg-[#07204C]/40"
          />
          <div className="dk-anim-slide-left absolute inset-y-0 left-0 flex w-[86%] max-w-[340px] flex-col bg-white shadow-[0_0_60px_-10px_rgba(7,32,76,0.45)]">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--dk-border)] px-5 py-4">
              <span className="font-display text-[12px] font-extrabold uppercase tracking-[0.11em] text-[var(--dk-muted)]">
                Documentation
              </span>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setPanel('none')}
                className="-mr-2 rounded-lg p-2 text-[var(--dk-muted)] transition-colors hover:bg-[var(--dk-accent-surface)] hover:text-[var(--dk-heading)]"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={2.2} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-5">{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SectionDropdown({
  items,
  activeId,
  onPick,
}: {
  items: TocItem[];
  activeId: string | null;
  onPick: () => void;
}) {
  return (
    <div className="dk-anim-fade max-h-[min(58vh,420px)] overflow-y-auto border-t border-[var(--dk-border)] bg-white px-[clamp(20px,4vw,78px)] py-3">
      <ul className="flex flex-col gap-0.5 border-l-2 border-[var(--dk-border)]">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id} style={{ paddingLeft: `${(item.depth - 2) * 12}px` }}>
              <a
                href={`#${item.id}`}
                onClick={onPick}
                className={`-ml-0.5 block border-l-2 py-2 pl-3.5 font-sans text-[14px] leading-[1.35] no-underline transition-colors ${
                  active
                    ? 'border-[var(--dk-accent)] font-bold text-[var(--dk-accent)]'
                    : 'border-transparent text-[var(--dk-muted)]'
                }`}
              >
                {item.value}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
