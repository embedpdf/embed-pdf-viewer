import {
  CpuIcon,
  HighlighterIcon,
  Image02Icon,
  Layout01Icon,
  PuzzleIcon,
  Search01Icon,
  ServerStack01Icon,
  TaskEdit01Icon,
  TextSelectionIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
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

/**
 * The glyph vocabulary a <GridCard icon="…"> may name, drawn from Hugeicons —
 * the same set the rest of both sites uses. Authors pick a subject, not a
 * picture, so a shared corpus page never imports a site's icon module; adding
 * a subject here is the only step needed to give a new page a mark.
 */
const GRID_CARD_ICONS = {
  stage: Layout01Icon,
  render: Image02Icon,
  selection: TextSelectionIcon,
  annotation: HighlighterIcon,
  form: TaskEdit01Icon,
  search: Search01Icon,
  engine: CpuIcon,
  server: ServerStack01Icon,
  plugin: PuzzleIcon,
} as const;

export type GridCardIcon = keyof typeof GRID_CARD_ICONS;

/**
 * Named breakpoints only: an arbitrary `min-[…]` variant sorts BEFORE `sm` in
 * the generated sheet, so `sm:grid-cols-2` would win at every width above it.
 * Three-up waits for `xl` because the docs column is what has to fit the
 * cards, not the window — the sidebar and table of contents eat ~430px.
 */
const GRID_COLUMNS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 xl:grid-cols-3',
} as const;

/**
 * The tile form of <Cards>: a browsable grid for overview pages, where the
 * reader is choosing among siblings rather than being pointed at what's next.
 */
export function CardGrid({
  children,
  columns = 3,
}: {
  children: ReactNode;
  columns?: keyof typeof GRID_COLUMNS;
}) {
  return (
    <div className={`mt-[22px] grid items-stretch gap-3.5 ${GRID_COLUMNS[columns]}`}>{children}</div>
  );
}

export function GridCard({
  icon = 'plugin',
  title,
  description,
  href,
}: {
  icon?: GridCardIcon;
  title: string;
  description?: string;
  href: string;
}) {
  const glyph = GRID_CARD_ICONS[icon] ?? GRID_CARD_ICONS.plugin;

  return (
    <Link
      href={href}
      className="group flex flex-col rounded-[14px] border border-[var(--dk-border)] bg-white p-[18px] no-underline transition-all hover:-translate-y-0.5 hover:border-[#CFE0FF] hover:shadow-[0_16px_32px_-22px_rgba(22,119,255,0.45)]"
    >
      <span className="inline-flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[11px] bg-[var(--dk-accent-surface)] text-[var(--dk-accent)]">
        <HugeiconsIcon icon={glyph} size={21} strokeWidth={2} />
      </span>
      <span className="font-display mt-3.5 flex items-center gap-1.5 text-base font-extrabold leading-[1.2] tracking-[-0.01em] text-[var(--dk-heading)]">
        {title}
        <ArrowRight
          width={15}
          height={15}
          className="text-[var(--dk-accent)] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
        />
      </span>
      {description ? (
        <span className="mt-1.5 block font-sans text-[13.5px] leading-[1.45] text-[var(--dk-muted)]">
          {description}
        </span>
      ) : null}
    </Link>
  );
}
