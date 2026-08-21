'use client';

import { Children, isValidElement, useState, type ReactNode } from 'react';

/**
 * The branches of a union in a request or response schema. A union is the
 * one place where a field list cannot just nest: the reader has to pick a
 * shape, and the shapes are alternatives, not siblings. Tabs say that, and
 * they stay readable where a stacked list does not — the annotation union
 * has nineteen branches.
 *
 * Unlike the SDK-language switcher this is deliberately NOT persisted:
 * which annotation subtype you were last reading says nothing about which
 * import source you want now.
 */
export function VariantTabs({
  labels,
  discriminator,
  children,
}: {
  labels: string[];
  /** The property that selects the branch, when the union has one. */
  discriminator?: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const panels = Children.toArray(children).filter(isValidElement);
  const index = Math.min(active, panels.length - 1);

  return (
    <div className="border-cp-borderSoft overflow-hidden rounded-[10px] border bg-[#FBFCFE]">
      <div className="border-cp-borderSoft flex items-center gap-1 overflow-x-auto border-b bg-[#F4F7FD] px-2 py-[7px] [scrollbar-width:thin]">
        <span className="text-cp-muted shrink-0 px-1.5 font-sans text-[11px] font-bold uppercase tracking-[0.06em]">
          {discriminator ? `${discriminator} =` : 'one of'}
        </span>
        {labels.map((label, position) => (
          <button
            key={label}
            type="button"
            onClick={() => setActive(position)}
            aria-pressed={position === index}
            className={`inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-[7px] px-[9px] py-[5px] font-mono text-[12px] font-semibold leading-none transition ${
              position === index
                ? 'bg-cp-navy text-white'
                : 'text-cp-muted hover:text-cp-navy hover:bg-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {panels[index]}
    </div>
  );
}
