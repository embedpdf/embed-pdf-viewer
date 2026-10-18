import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { SITE_ORIGIN } from '@/lib/site';

import { EpButton } from '../button';
import { DotGrid } from '../dot-grid';
import { Eyebrow, PillDivider } from '../eyebrow';
import {
  AngularIcon,
  ArrowRightIcon,
  CheckIcon,
  DownloadIcon,
  ReactIcon,
  ShieldCheckIcon,
  StarIcon,
  SvelteIcon,
  VueIcon,
} from '../icons';
import { CodeWindow, type CodeFile } from './code-window';
import type { Framework } from './framework';

/*
 * The building blocks of the framework landing pages, in the homepage's
 * visual language (eyebrow pill, display heading, 60×7 pill divider, white
 * cards on the soft page background, dark code cards). Every block takes its
 * words from the page: nothing here writes copy of its own.
 */

const PAGE_X = 'mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,80px)]';
const SECTION_Y = 'py-[clamp(64px,8vw,110px)]';

export function FrameworkIcon({ framework, size = 16 }: { framework: Framework; size?: number }) {
  switch (framework) {
    case 'react':
      return <ReactIcon size={size} />;
    case 'vue':
      return <VueIcon size={size} />;
    case 'svelte':
      return <SvelteIcon size={size} />;
    case 'angular':
      return <AngularIcon size={size} />;
  }
}

function Check({ color = '#0876FD' }: { color?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      className="mt-px flex-shrink-0"
    >
      <circle cx="11" cy="11" r="11" fill={color} fillOpacity="0.14" />
      <path
        d="M6.5 11.2l3 3 6-6.4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-display text-ep-blue hover:text-ep-blue700 inline-flex items-center gap-1.5 text-[15px] font-semibold transition-all duration-200 hover:gap-2.5"
    >
      {children}
      <ArrowRightIcon size={14} strokeWidth={2.4} />
    </Link>
  );
}

// ── hero ────────────────────────────────────────────────────────────────────

/**
 * The page's H1 and first screen: the framework badge, the promise, two
 * calls to action and the proof pills on the left; the viewer with the
 * framework's own code floating over it on the right.
 */
export function FrameworkHero({
  framework,
  badge,
  title,
  intro,
  primary,
  secondary = { href: '/demo', label: 'Live demo' },
  code,
  card,
}: {
  framework: Framework;
  badge: string;
  title: ReactNode;
  intro: ReactNode;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
  code: CodeFile;
  /** The small floating card under the code: a title and three short lines. */
  card: { title: string; items: string[] };
}) {
  return (
    <section className="bg-ep-bg relative w-full overflow-x-clip pb-[clamp(72px,8vw,120px)] pt-[clamp(56px,7vw,104px)]">
      <div className="relative mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,92px)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute left-[45%] top-[10%] hidden h-[520px] w-[620px] rounded-full bg-[#F4F7FE] min-[641px]:block" />
        </div>
        <div
          aria-hidden
          className="absolute right-[70px] top-[-40px] z-0 origin-top-right scale-75"
        >
          <DotGrid />
        </div>

        <div className="relative z-[1] grid items-center gap-[clamp(32px,4vw,64px)] min-[1025px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <div>
              <Eyebrow icon={<FrameworkIcon framework={framework} size={15} />}>{badge}</Eyebrow>
            </div>
            <h1 className="font-display text-ep-navy m-0 text-[clamp(36px,4.8vw,58px)] font-extrabold leading-[1.06] tracking-[-0.015em] [text-wrap:balance]">
              {title}
            </h1>
            <PillDivider />
            <p className="text-ep-body m-0 max-w-[560px] font-sans text-[17px] leading-[1.6]">
              {intro}
            </p>
            <div className="mt-1 flex flex-wrap gap-3.5">
              <EpButton href={primary.href} variant="primary" icon="arrow">
                {primary.label}
              </EpButton>
              <EpButton href={secondary.href} variant="outline" icon="play">
                {secondary.label}
              </EpButton>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href="https://github.com/embedpdf/embed-pdf-viewer"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ep-navy inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E9EEFF] bg-white px-3.5 py-2 font-sans text-[13px] font-medium text-[#3D4E75] transition-colors hover:border-[#CFDCFF]"
              >
                <StarIcon size={14} className="text-ep-blue" />
                <b className="text-ep-navy font-bold">4K+</b>
                <span>stars</span>
              </a>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E9EEFF] bg-white px-3.5 py-2 font-sans text-[13px] font-medium text-[#3D4E75]">
                <DownloadIcon size={14} className="text-ep-blue" />
                <b className="text-ep-navy font-bold">1M+</b>
                <span>downloads</span>
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E9EEFF] bg-white px-3.5 py-2 font-sans text-[13px] font-medium text-[#3D4E75]">
                <ShieldCheckIcon size={14} className="text-[#22C55E]" />
                <span>Apache-2.0 licensed</span>
              </span>
            </div>
          </div>

          <div className="relative min-w-0 pb-[clamp(0px,6vw,90px)] max-[1024px]:pb-0">
            <Image
              src="/PDF-Viewer.svg"
              alt={`The EmbedPDF viewer running in a ${badge.split(' ')[0]} app`}
              width={646}
              height={511}
              className="border-ep-border ml-auto block aspect-[646/511] w-full max-w-[600px] rounded-[12px] border bg-white shadow-[0_4px_10px_rgba(163,163,163,0.22)] max-[1024px]:mx-auto"
              priority
            />
            <div className="absolute bottom-0 left-0 z-[2] w-[min(440px,78%)] max-[1024px]:relative max-[1024px]:mx-auto max-[1024px]:-mt-16 max-[1024px]:w-full max-[1024px]:max-w-[560px]">
              <CodeWindow file={code} compact />
            </div>
            <div className="absolute right-[-8px] top-[18%] z-[3] w-[220px] rounded-xl border border-[#E9EEFF] bg-white p-4 shadow-[0_8px_28px_rgba(14,26,64,0.14)] max-[1180px]:hidden">
              <div className="font-display text-ep-navy mb-3 text-[13px] font-extrabold tracking-[-0.005em]">
                {card.title}
              </div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {card.items.map((item) => (
                  <li
                    key={item}
                    className="text-ep-ink flex items-center gap-2 font-sans text-[12.5px] font-medium leading-[1.35]"
                  >
                    <span className="text-ep-blue inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-[rgba(8,118,253,0.12)]">
                      <CheckIcon size={11} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── section heading ─────────────────────────────────────────────────────────

export function SectionHeading({
  eyebrow,
  eyebrowIcon,
  title,
  lead,
  align = 'center',
  tone = 'light',
}: {
  eyebrow: string;
  eyebrowIcon?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  align?: 'center' | 'left';
  tone?: 'light' | 'dark';
}) {
  const centered = align === 'center';
  return (
    <div
      className={`flex flex-col ${centered ? 'mx-auto max-w-[760px] items-center text-center' : 'items-start'}`}
    >
      <div className="mb-5">
        <Eyebrow dot={!eyebrowIcon} icon={eyebrowIcon} tone={tone}>
          {eyebrow}
        </Eyebrow>
      </div>
      <h2
        className={`font-display m-0 mb-[18px] text-[clamp(32px,3.8vw,50px)] font-bold leading-[1.08] tracking-[-0.02em] [text-wrap:balance] ${
          tone === 'dark' ? 'text-white' : 'text-ep-navy'
        }`}
      >
        {title}
      </h2>
      <PillDivider gradient />
      {lead && (
        <p
          className={`mb-0 mt-[18px] max-w-[600px] font-sans text-[17px] leading-[1.6] ${
            tone === 'dark' ? 'text-ep-faint' : 'text-ep-muted'
          }`}
        >
          {lead}
        </p>
      )}
    </div>
  );
}

// ── steps: numbered, each with its code ─────────────────────────────────────

export type Step = { title: string; body: ReactNode; code?: CodeFile };

/** Numbered steps down the left, each one's code on the right. */
export function CodeSteps({
  eyebrow,
  title,
  lead,
  steps,
  footer,
  surface = 'white',
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  steps: Step[];
  footer?: ReactNode;
  surface?: 'white' | 'soft';
}) {
  return (
    <section className={`${surface === 'white' ? 'bg-white' : 'bg-ep-bg'} ${SECTION_Y}`}>
      <div className={PAGE_X}>
        <SectionHeading eyebrow={eyebrow} title={title} lead={lead} />
        <ol className="mx-auto mt-14 flex max-w-[1120px] list-none flex-col gap-10 p-0">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="grid items-start gap-6 min-[961px]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] min-[961px]:gap-12"
            >
              <div className="flex gap-4">
                <span className="font-display from-ep-blue to-ep-purple inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-base font-extrabold text-white shadow-[0_8px_18px_-8px_rgba(8,118,253,0.6)]">
                  {i + 1}
                </span>
                <div className="pt-1.5">
                  <h3 className="font-display text-ep-navy m-0 mb-2 text-[20px] font-extrabold leading-[1.25] tracking-[-0.01em]">
                    {step.title}
                  </h3>
                  <div className="text-ep-muted font-sans text-[15.5px] leading-[1.6] [&_code]:rounded-md [&_code]:border [&_code]:border-[#E0E8F6] [&_code]:bg-[#EEF3FC] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.88em] [&_code]:text-[#0758B8] [&_p+p]:mt-3 [&_p]:m-0">
                    {step.body}
                  </div>
                </div>
              </div>
              {step.code ? <CodeWindow file={step.code} /> : <div />}
            </li>
          ))}
        </ol>
        {footer && <div className="mt-12 flex flex-wrap justify-center gap-5">{footer}</div>}
      </div>
    </section>
  );
}

// ── split: words on one side, code on the other ─────────────────────────────

export function SplitShowcase({
  eyebrow,
  eyebrowIcon,
  title,
  body,
  points,
  code,
  links,
  reverse = false,
  surface = 'soft',
}: {
  eyebrow: string;
  eyebrowIcon?: ReactNode;
  title: ReactNode;
  body: ReactNode;
  points?: ReactNode[];
  code: CodeFile;
  links?: ReactNode;
  reverse?: boolean;
  surface?: 'white' | 'soft';
}) {
  return (
    <section className={`${surface === 'white' ? 'bg-white' : 'bg-ep-bg'} ${SECTION_Y}`}>
      <div
        className={`${PAGE_X} grid items-center gap-[clamp(36px,5vw,80px)] min-[1025px]:grid-cols-2`}
      >
        <div className={`flex min-w-0 flex-col ${reverse ? 'min-[1025px]:order-2' : ''}`}>
          <SectionHeading eyebrow={eyebrow} eyebrowIcon={eyebrowIcon} title={title} align="left" />
          <div className="text-ep-muted mt-6 flex max-w-[560px] flex-col gap-4 font-sans text-[16.5px] leading-[1.65] [&_code]:rounded-md [&_code]:border [&_code]:border-[#E0E8F6] [&_code]:bg-[#EEF3FC] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.86em] [&_code]:text-[#0758B8] [&_p]:m-0">
            {body}
          </div>
          {points && (
            <ul className="m-0 mt-6 flex list-none flex-col gap-3 p-0">
              {points.map((point, i) => (
                <li
                  key={i}
                  className="text-ep-navy flex items-start gap-3 font-sans text-[15px] font-medium leading-[1.5] [&_code]:text-[0.9em] [&_code]:text-[#0758B8]"
                >
                  <Check />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
          {links && <div className="mt-8 flex flex-wrap items-center gap-5">{links}</div>}
        </div>
        <div className={`min-w-0 ${reverse ? 'min-[1025px]:order-1' : ''}`}>
          <CodeWindow file={code} />
        </div>
      </div>
    </section>
  );
}

// ── two paths: the ready-made viewer or the headless library ───────────────

type PathCard = {
  label: string;
  title: string;
  body: ReactNode;
  install: string;
  bullets: string[];
  href: string;
  cta: string;
};

export function TwoPaths({
  eyebrow,
  title,
  lead,
  viewer,
  headless,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  viewer: PathCard;
  headless: PathCard;
}) {
  return (
    <section className={`bg-ep-bg ${SECTION_Y}`}>
      <div className={PAGE_X}>
        <SectionHeading eyebrow={eyebrow} title={title} lead={lead} />
        <div className="relative mt-14 grid gap-6 min-[961px]:grid-cols-2">
          <div
            aria-hidden
            className="font-display text-ep-navy pointer-events-none absolute left-1/2 top-1/2 z-[2] hidden h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[rgba(7,32,76,0.10)] bg-white text-[13px] font-extrabold tracking-[0.06em] shadow-[0_4px_14px_rgba(7,32,76,0.08)] min-[961px]:inline-flex"
          >
            OR
          </div>
          {[
            { card: viewer, tone: 'blue' as const },
            { card: headless, tone: 'purple' as const },
          ].map(({ card, tone }) => (
            <article
              key={card.title}
              className={`flex flex-col gap-5 rounded-3xl border p-[clamp(22px,2.6vw,34px)] ${
                tone === 'blue' ? 'border-[#BFD8FB] bg-[#ECF3FE]' : 'border-[#D9C8F8] bg-[#F5F0FE]'
              }`}
            >
              <span
                className={`font-display self-start rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                  tone === 'blue' ? 'bg-ep-mistDeep text-ep-blue700' : 'bg-[#ECE2FB] text-[#6A2BC9]'
                }`}
              >
                {card.label}
              </span>
              <h3 className="font-display text-ep-navy m-0 text-[clamp(22px,1.9vw,28px)] font-extrabold leading-[1.15] tracking-[-0.01em]">
                {card.title}
              </h3>
              <div className="text-ep-slate font-sans text-[15.5px] leading-[1.6] [&_code]:text-[0.9em] [&_code]:text-[#0758B8] [&_p]:m-0">
                {card.body}
              </div>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {card.bullets.map((b) => (
                  <li
                    key={b}
                    className="text-ep-navy flex items-start gap-2.5 font-sans text-[14.5px] font-medium leading-[1.45]"
                  >
                    <Check color={tone === 'blue' ? '#0876FD' : '#9747FF'} />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-col gap-4 border-t border-[rgba(7,32,76,0.08)] pt-5">
                <code className="block overflow-x-auto whitespace-nowrap rounded-[10px] border border-[rgba(7,32,76,0.08)] bg-white px-4 py-3 font-mono text-[13px] text-[#1A2748]">
                  <span className="select-none text-[#8FA0C4]">$ </span>
                  {card.install}
                </code>
                <TextLink href={card.href}>{card.cta}</TextLink>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── feature cards (the capability illustrations) ────────────────────────────

export type Feature = { image: string; title: string; body: string; href: string };

export function FeatureGrid({
  eyebrow,
  eyebrowIcon,
  title,
  lead,
  features,
  links,
}: {
  eyebrow: string;
  eyebrowIcon?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  features: Feature[];
  links?: ReactNode;
}) {
  return (
    <section className={`relative overflow-hidden bg-white ${SECTION_Y}`}>
      <div
        className={`${PAGE_X} grid items-start gap-[clamp(40px,5vw,88px)] min-[1101px]:grid-cols-[minmax(280px,380px)_1fr]`}
      >
        <div className="flex flex-col items-start min-[1101px]:sticky min-[1101px]:top-[120px]">
          <SectionHeading
            eyebrow={eyebrow}
            eyebrowIcon={eyebrowIcon}
            title={title}
            lead={lead}
            align="left"
          />
          {links && <div className="mt-8 flex flex-wrap items-center gap-5">{links}</div>}
        </div>
        <div className="grid grid-cols-1 gap-4 min-[561px]:grid-cols-2 min-[901px]:grid-cols-3">
          {features.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="border-ep-border group relative flex flex-col overflow-hidden rounded-2xl border bg-white px-[18px] pb-5 pt-[18px] transition-all duration-200 hover:-translate-y-[3px] hover:border-[rgba(8,118,253,0.30)] hover:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_4px_rgba(7,32,76,0.06),0_18px_36px_-16px_rgba(8,118,253,0.22)]"
            >
              <div className="mb-4 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-[#F4F8FF]">
                <Image
                  src={f.image}
                  alt=""
                  width={160}
                  height={160}
                  className="block h-auto w-[62%] rounded-lg"
                />
              </div>
              <h3 className="font-display text-ep-navy m-0 mb-1.5 flex items-center gap-1.5 text-[17px] font-extrabold leading-[1.2] tracking-[-0.01em]">
                {f.title}
                <span className="text-ep-blue -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                  <ArrowRightIcon size={14} strokeWidth={2.4} />
                </span>
              </h3>
              <p className="text-ep-soft m-0 font-sans text-[14px] leading-[1.55]">{f.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── reasons: a grid of short arguments ──────────────────────────────────────

export type Reason = { icon: ReactNode; title: string; body: ReactNode };

export function ReasonGrid({
  eyebrow,
  eyebrowIcon,
  title,
  lead,
  reasons,
  surface = 'soft',
}: {
  eyebrow: string;
  eyebrowIcon?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  reasons: Reason[];
  surface?: 'white' | 'soft';
}) {
  return (
    <section className={`${surface === 'white' ? 'bg-white' : 'bg-ep-bg'} ${SECTION_Y}`}>
      <div className={PAGE_X}>
        <SectionHeading eyebrow={eyebrow} eyebrowIcon={eyebrowIcon} title={title} lead={lead} />
        <div className="mt-14 grid gap-5 min-[641px]:grid-cols-2 min-[1101px]:grid-cols-3">
          {reasons.map((r) => (
            <article
              key={r.title}
              className="border-ep-border flex flex-col gap-3 rounded-2xl border bg-white p-6 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_1px_2px_rgba(7,32,76,0.04),0_12px_32px_-18px_rgba(7,32,76,0.10)]"
            >
              <span className="bg-ep-mist text-ep-blue inline-flex h-11 w-11 items-center justify-center rounded-xl">
                {r.icon}
              </span>
              <h3 className="font-display text-ep-navy m-0 text-[18px] font-extrabold leading-[1.25] tracking-[-0.01em]">
                {r.title}
              </h3>
              <div className="text-ep-muted font-sans text-[15px] leading-[1.6] [&_code]:text-[0.9em] [&_code]:text-[#0758B8] [&_p]:m-0">
                {r.body}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── comparison ──────────────────────────────────────────────────────────────

export type CompareRow = { topic: string; ours: ReactNode; theirs: ReactNode };

function Mark({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(34,197,94,0.14)] text-[#16A34A]">
      <CheckIcon size={13} strokeWidth={2.6} />
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(7,32,76,0.06)] text-[#8FA0C4]">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 12h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** A cell: a mark, then the words that qualify it. */
export function Cell({ yes, children }: { yes: boolean; children: ReactNode }) {
  return (
    <span className="flex items-start gap-2.5">
      <Mark yes={yes} />
      <span className="pt-0.5">{children}</span>
    </span>
  );
}

export function CompareTable({
  eyebrow,
  title,
  lead,
  theirsLabel,
  rows,
  note,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  theirsLabel: string;
  rows: CompareRow[];
  note?: ReactNode;
}) {
  return (
    <section className={`bg-white ${SECTION_Y}`}>
      <div className={PAGE_X}>
        <SectionHeading eyebrow={eyebrow} title={title} lead={lead} />
        <div className="border-ep-border mx-auto mt-12 max-w-[1040px] overflow-x-auto rounded-2xl border bg-white shadow-[0_12px_32px_-18px_rgba(7,32,76,0.12)]">
          <table className="w-full min-w-[640px] border-collapse text-left font-sans text-[14.5px] leading-[1.5]">
            <thead>
              <tr className="border-ep-border border-b bg-[#F7F9FE]">
                <th className="font-display text-ep-subtle w-[26%] px-5 py-4 text-xs font-bold uppercase tracking-[0.08em]">
                  What you need
                </th>
                <th className="font-display text-ep-navy w-[37%] px-5 py-4 text-[15px] font-extrabold">
                  <span className="inline-flex items-center gap-2">
                    <Image src="/embedpdf-icon.svg" alt="" width={20} height={20} />
                    EmbedPDF
                  </span>
                </th>
                <th className="font-display text-ep-slate w-[37%] px-5 py-4 text-[15px] font-bold">
                  {theirsLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.topic} className="border-ep-border border-b last:border-b-0">
                  <th className="font-display text-ep-navy px-5 py-4 align-top text-[14.5px] font-bold">
                    {row.topic}
                  </th>
                  <td className="text-ep-ink px-5 py-4 align-top">{row.ours}</td>
                  <td className="text-ep-muted px-5 py-4 align-top">{row.theirs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {note && (
          <p className="text-ep-subtle mx-auto mb-0 mt-5 max-w-[760px] text-center font-sans text-[13.5px] leading-[1.6]">
            {note}
          </p>
        )}
      </div>
    </section>
  );
}

// ── FAQ ─────────────────────────────────────────────────────────────────────

export type Faq = { question: string; answer: string };

/**
 * Questions as native disclosure widgets: answers stay in the HTML (crawlers
 * and Ctrl+F see them), and no script is needed to open one. The same list
 * feeds the page's FAQPage structured data, so answers are plain strings.
 */
export function FaqList({
  eyebrow,
  title,
  lead,
  faqs,
  surface = 'soft',
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  faqs: Faq[];
  surface?: 'white' | 'soft';
}) {
  return (
    <section className={`${surface === 'white' ? 'bg-white' : 'bg-ep-bg'} ${SECTION_Y}`}>
      <div
        className={`${PAGE_X} grid items-start gap-[clamp(36px,5vw,88px)] min-[1025px]:grid-cols-[minmax(260px,360px)_1fr]`}
      >
        <SectionHeading eyebrow={eyebrow} title={title} lead={lead} align="left" />
        <div className="flex flex-col gap-3">
          {faqs.map((faq, i) => (
            <details
              key={faq.question}
              open={i === 0}
              className="border-ep-border group rounded-2xl border bg-white px-6 py-1 transition-colors open:border-[rgba(8,118,253,0.28)] open:shadow-[0_14px_30px_-18px_rgba(8,118,253,0.25)]"
            >
              <summary className="font-display text-ep-navy flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16.5px] font-bold leading-[1.35] [&::-webkit-details-marker]:hidden">
                {faq.question}
                <span className="bg-ep-mist text-ep-blue inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-open:rotate-45">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </summary>
              <p className="text-ep-muted m-0 pb-5 font-sans text-[15.5px] leading-[1.65]">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── closing call to action ──────────────────────────────────────────────────

export function ClosingCta({
  framework,
  title,
  body,
  install,
  primary,
  secondary,
}: {
  framework: Framework;
  title: ReactNode;
  body: ReactNode;
  install: CodeFile;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
}) {
  return (
    <section className="ep-qs-bg relative w-full overflow-hidden py-[clamp(80px,10vw,140px)]">
      <div className="ep-qs-glare" aria-hidden />
      <div className="relative z-[1] mx-auto grid w-full max-w-[1200px] items-center gap-[clamp(32px,5vw,72px)] px-[clamp(20px,4vw,40px)] min-[961px]:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="flex flex-col items-start">
          <div className="mb-6">
            <Eyebrow tone="dark" icon={<FrameworkIcon framework={framework} size={14} />}>
              Ready when you are
            </Eyebrow>
          </div>
          <h2 className="font-display m-0 mb-5 text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.08] tracking-[-0.02em] text-white [text-wrap:balance]">
            {title}
          </h2>
          <p className="text-ep-faint m-0 mb-8 max-w-[520px] font-sans text-[17px] leading-[1.6]">
            {body}
          </p>
          <div className="flex flex-wrap gap-3.5">
            <EpButton href={primary.href} variant="primary" icon="arrow">
              {primary.label}
            </EpButton>
            <Link
              href={secondary.href}
              className="inline-flex h-[50px] items-center gap-2.5 whitespace-nowrap rounded-[10px] border-2 border-white/20 px-[22px] font-sans text-base font-bold text-white transition-all duration-150 hover:-translate-y-px hover:border-white/40 hover:bg-white/[0.06]"
            >
              {secondary.label}
            </Link>
          </div>
        </div>
        <CodeWindow file={install} />
      </div>
    </section>
  );
}

// ── structured data ─────────────────────────────────────────────────────────

/**
 * The page's JSON-LD: the library as a free developer application, and its
 * FAQ. Written from the same strings the page renders, so the two can't
 * disagree.
 */
export function FrameworkJsonLd({
  name,
  description,
  url,
  faqs,
}: {
  name: string;
  description: string;
  url: string;
  faqs: Faq[];
}) {
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name,
      description,
      url: new URL(url, SITE_ORIGIN).href,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web browser',
      license: 'https://www.apache.org/licenses/LICENSE-2.0',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    },
  ];
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output contains no `</script>` unless the copy does;
      // escape `<` anyway so a future answer can't close the tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
