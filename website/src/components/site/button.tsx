import Link from 'next/link';
import type { ReactNode } from 'react';

import { ArrowRightIcon, PlayIcon } from './icons';

const BASE =
  'inline-flex h-[50px] items-center gap-2.5 whitespace-nowrap rounded-[10px] px-[22px] font-sans text-base font-bold ' +
  'transition-all duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:duration-[50ms] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ep-blue';

const VARIANTS = {
  primary:
    'bg-ep-blue text-white hover:bg-ep-blue600 hover:shadow-[0_8px_20px_rgba(8,118,253,0.28)] active:bg-ep-blue800',
  outline:
    'border-2 border-ep-blue text-ep-blue hover:border-ep-blue600 hover:bg-[rgba(8,118,253,0.08)] hover:text-ep-blue600 active:bg-[rgba(8,118,253,0.16)]',
} as const;

export function EpButton({
  variant = 'primary',
  icon = 'arrow',
  href,
  children,
}: {
  variant?: keyof typeof VARIANTS;
  icon?: 'arrow' | 'play' | 'none';
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]}`}>
      {icon === 'play' && <PlayIcon size={16} />}
      <span>{children}</span>
      {icon === 'arrow' && <ArrowRightIcon size={20} />}
    </Link>
  );
}
