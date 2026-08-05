import Link from 'next/link';
import type { ReactNode } from 'react';

import { ArrowRight } from '@/components/site/icons';

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
      className="border-cp-border group flex items-start gap-3.5 rounded-[14px] border bg-white p-[18px] no-underline transition-all hover:border-[#CFE0FF] hover:shadow-[0_14px_30px_-20px_rgba(22,119,255,0.4)]"
    >
      <span className="bg-cp-surface text-cp-blue inline-flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[11px]">
        <ArrowRight
          width={20}
          height={20}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </span>
      <span className="min-w-0">
        <span className="font-display text-cp-navy block text-base font-extrabold leading-[1.2] tracking-[-0.01em]">
          {title}
        </span>
        {description ? (
          <span className="text-cp-muted mt-1 block font-sans text-[13.5px] leading-[1.45]">
            {description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
