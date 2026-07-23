import { FlashIcon, PuzzleIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Eyebrow } from './eyebrow';
import {
  AngularIcon,
  ArrowRightIcon,
  BookIcon,
  JsMark,
  ReactIcon,
  SvelteIcon,
  VueIcon,
} from './icons';

function Check({ color }: { color: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      className="flex-shrink-0"
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

function StackChip({
  icon,
  label,
  href,
  accent,
}: {
  icon: ReactNode;
  label: string;
  href: string;
  accent: 'blue' | 'purple';
}) {
  const hover =
    accent === 'blue'
      ? 'hover:border-[rgba(8,118,253,0.35)] hover:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_4px_rgba(7,32,76,0.08),0_14px_28px_-10px_rgba(8,118,253,0.22)] [&:hover_.chip-arrow]:text-ep-blue'
      : 'hover:border-[rgba(151,71,255,0.40)] hover:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_4px_rgba(7,32,76,0.08),0_14px_28px_-10px_rgba(151,71,255,0.26)] [&:hover_.chip-arrow]:text-ep-purple';
  return (
    <Link
      href={href}
      className={`font-display text-ep-navy group relative inline-flex items-center gap-[9px] rounded-[10px] border border-[rgba(7,32,76,0.10)] bg-white py-2.5 pl-3 pr-[34px] text-sm font-semibold tracking-[-0.005em] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_1px_2px_rgba(7,32,76,0.06),0_4px_10px_-6px_rgba(7,32,76,0.10)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${hover}`}
    >
      <span className="inline-flex h-[22px] w-[22px] items-center justify-center transition-transform duration-200 group-hover:rotate-[-3deg] group-hover:scale-[1.08]">
        {icon}
      </span>
      <span>{label}</span>
      <span className="chip-arrow pointer-events-none absolute right-[11px] top-1/2 inline-flex -translate-y-1/2 translate-x-[-3px] items-center justify-center text-[rgba(7,32,76,0.35)] transition-all duration-200 group-hover:translate-x-0">
        <ArrowRightIcon size={14} strokeWidth={2.5} />
      </span>
    </Link>
  );
}

function IntegrationCard({
  tone,
  badgeIcon,
  badgeLabel,
  illustration,
  title,
  sub,
  bullets,
  chips,
}: {
  tone: 'blue' | 'purple';
  badgeIcon: ReactNode;
  badgeLabel: string;
  illustration: string;
  title: string;
  sub: string;
  bullets: string[];
  chips: ReactNode;
}) {
  const accent = tone === 'blue' ? '#0876FD' : '#9747FF';
  return (
    // Subgrid: both cards share the same badge/body/docs row tracks, so the
    // "READ THE DOCS" divider sits at the same height in both.
    <article
      className={`flex flex-col gap-5 rounded-3xl border p-6 min-[1101px]:row-span-3 min-[1101px]:grid min-[1101px]:grid-rows-subgrid ${
        tone === 'blue' ? 'border-[#BFD8FB] bg-[#ECF3FE]' : 'border-[#D9C8F8] bg-[#F5F0FE]'
      }`}
    >
      <span
        className={`font-display inline-flex items-center gap-2 self-start rounded-full py-2 pl-2.5 pr-3.5 text-[13px] font-semibold tracking-[0.01em] ${
          tone === 'blue' ? 'bg-ep-mistDeep text-ep-blue700' : 'bg-[#ECE2FB] text-[#6A2BC9]'
        }`}
      >
        {badgeIcon}
        {badgeLabel}
      </span>
      <div className="grid items-center gap-5 min-[761px]:grid-cols-2">
        <div className="flex items-center justify-start">
          <Image
            src={illustration}
            alt=""
            width={360}
            height={280}
            className="block h-auto w-full max-w-[360px] object-contain object-left"
          />
        </div>
        <div className="flex flex-col gap-[22px]">
          <h3 className="font-display text-ep-navy m-0 text-[clamp(20px,1.6vw,24px)] font-extrabold leading-[1.2] tracking-[-0.01em]">
            {title}
          </h3>
          <p className="text-ep-slate -mt-2 mb-0 max-w-[38ch] font-sans text-[15px] leading-[1.5]">
            {sub}
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {bullets.map((b) => (
              <li
                key={b}
                className="text-ep-navy flex items-center gap-2.5 font-sans text-sm font-medium leading-[1.4]"
              >
                <Check color={accent} />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-3 border-t border-[rgba(7,32,76,0.08)] pt-1 min-[1101px]:mt-0">
        <span className="font-display text-ep-soft mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.10em]">
          <BookIcon size={14} className="opacity-70" />
          Read the docs
        </span>
        <div className="flex flex-wrap gap-2.5">{chips}</div>
      </div>
    </article>
  );
}

export function TwoWays() {
  return (
    <section className="bg-ep-bg py-[clamp(60px,8vw,110px)]">
      <div className="mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,80px)]">
        <div className="mx-auto mb-14 flex max-w-[720px] flex-col items-center text-center">
          <div className="mb-5">
            <Eyebrow dot>Integration</Eyebrow>
          </div>
          <h2 className="font-display text-ep-navy m-0 mb-[18px] text-[clamp(36px,4.4vw,56px)] font-bold leading-[1.05] tracking-[-0.02em]">
            Two ways to <em className="ep-grad not-italic">integrate</em>
          </h2>
          <div className="from-ep-blue to-ep-purple h-[7px] w-[60px] rounded-[10px] bg-gradient-to-r" />
          <p className="text-ep-body mb-0 mt-[18px] max-w-[540px] font-sans text-[17px] leading-[1.55]">
            Choose the level of control that fits your project.
          </p>
        </div>

        <div className="relative grid items-stretch gap-6 min-[1101px]:grid-cols-2">
          <div
            aria-hidden
            className="font-display text-ep-navy pointer-events-none absolute left-1/2 top-1/2 z-[2] inline-flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[rgba(7,32,76,0.10)] bg-white text-[13px] font-extrabold tracking-[0.06em] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_4px_14px_rgba(7,32,76,0.08),0_12px_28px_-10px_rgba(8,118,253,0.18)]"
          >
            OR
          </div>

          <IntegrationCard
            tone="blue"
            badgeIcon={
              <HugeiconsIcon icon={FlashIcon} size={16} strokeWidth={2} className="text-ep-blue" />
            }
            badgeLabel="Recommended for speed"
            illustration="/illustration-readymade.svg"
            title="Ready-made Viewer"
            sub="A polished, production-ready PDF viewer that drops into your app in seconds."
            bullets={['Drop-in component', 'Fastest way to launch', 'Prebuilt toolbar and layout']}
            chips={
              <>
                <StackChip
                  accent="blue"
                  icon={<JsMark />}
                  label="Vanilla JS"
                  href="/docs/viewer/vanilla/getting-started"
                />
                <StackChip
                  accent="blue"
                  icon={<ReactIcon />}
                  label="React"
                  href="/docs/viewer/react/getting-started"
                />
                <StackChip
                  accent="blue"
                  icon={<VueIcon />}
                  label="Vue"
                  href="/docs/viewer/vue/getting-started"
                />
                <StackChip
                  accent="blue"
                  icon={<SvelteIcon />}
                  label="Svelte"
                  href="/docs/viewer/svelte/getting-started"
                />
                <StackChip
                  accent="blue"
                  icon={<AngularIcon />}
                  label="Angular"
                  href="/docs/viewer/angular/getting-started"
                />
              </>
            }
          />

          <IntegrationCard
            tone="purple"
            badgeIcon={
              <HugeiconsIcon
                icon={PuzzleIcon}
                size={16}
                strokeWidth={2}
                className="text-ep-purple"
              />
            }
            badgeLabel="Recommended for customization"
            illustration="/illustration-headless.svg"
            title="Headless Components"
            sub="Build your own custom viewer UI from scratch. We provide the engine, you control the pixels."
            bullets={['Build your own UI', 'Full composability', 'Plugin-friendly']}
            chips={
              <>
                <StackChip
                  accent="purple"
                  icon={<ReactIcon />}
                  label="React"
                  href="/docs/headless/react/getting-started"
                />
                <StackChip
                  accent="purple"
                  icon={<VueIcon />}
                  label="Vue"
                  href="/docs/headless/vue/getting-started"
                />
                <StackChip
                  accent="purple"
                  icon={<SvelteIcon />}
                  label="Svelte"
                  href="/docs/headless/svelte/getting-started"
                />
                <StackChip
                  accent="purple"
                  icon={<AngularIcon />}
                  label="Angular"
                  href="/docs/headless/angular/getting-started"
                />
              </>
            }
          />
        </div>
      </div>
    </section>
  );
}
