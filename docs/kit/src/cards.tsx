import Link from 'next/link';
import type { ReactNode } from 'react';

import { ArrowRight } from './icons';

export function Cards({ children }: { children: ReactNode }) {
  return <div className="mt-[22px] grid gap-3.5 sm:grid-cols-2">{children}</div>;
}

export function Card({
  title,
  description,
  href,
}: {
  title: string;
  description?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3.5 rounded-[14px] border border-[var(--dk-border)] bg-white p-[18px] no-underline transition-all hover:border-[#CFE0FF] hover:shadow-[0_14px_30px_-20px_rgba(22,119,255,0.4)]"
    >
      <span className="inline-flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[11px] bg-[var(--dk-accent-surface)] text-[var(--dk-accent)]">
        <ArrowRight
          width={20}
          height={20}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </span>
      <span className="min-w-0">
        <span className="font-display block text-base font-extrabold leading-[1.2] tracking-[-0.01em] text-[var(--dk-heading)]">
          {title}
        </span>
        {description ? (
          <span className="mt-1 block font-sans text-[13.5px] leading-[1.45] text-[var(--dk-muted)]">
            {description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
