import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  AngularIcon,
  ArrowRightIcon,
  EngineIcon,
  ReactIcon,
  SvelteIcon,
  VueIcon,
} from '@/components/site/icons';
import { DOCS_ENGINE_FOUNDATION, DOCS_OVERVIEW_PATHS } from '@/lib/docs-overview';
import { FRAMEWORK_LABELS, type Framework } from '@/lib/frameworks';

const FRAMEWORK_ICONS: Record<Framework, ReactNode> = {
  react: <ReactIcon size={18} />,
  vue: <VueIcon size={18} />,
  svelte: <SvelteIcon size={17} />,
  angular: <AngularIcon size={18} />,
};

const TONES = {
  viewer: {
    accent: '#0876FD',
    card: 'border-[#BFD8FB] bg-[#ECF3FE]',
    badge: 'bg-[#DDEBFF] text-[#075FCB]',
    check: 'bg-[#DCEBFF] text-[#0876FD]',
    link: 'border-[#BCD8FF] text-[#075FCB] hover:border-[#0876FD] hover:bg-white',
  },
  headless: {
    accent: '#9747FF',
    card: 'border-[#D9C8F8] bg-[#F5F0FE]',
    badge: 'bg-[#ECE2FB] text-[#6A2BC9]',
    check: 'bg-[#EDE3FC] text-[#7C3AED]',
    link: 'border-[#DACAF5] text-[#6A2BC9] hover:border-[#9747FF] hover:bg-white',
  },
} as const;

function Check({ tone }: { tone: keyof typeof TONES }) {
  return (
    <span
      className={`inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${TONES[tone].check}`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path
          d="m2.25 6.15 2.25 2.2 5.25-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function FrameworkLink({ framework }: { framework: Framework }) {
  return (
    <Link
      href={`/docs/headless/${framework}/getting-started`}
      className="border-ep-border text-ep-navy hover:border-ep-purple group inline-flex items-center gap-2 rounded-[10px] border bg-white px-3 py-2 font-sans text-[13px] font-bold no-underline transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-16px_rgba(124,58,237,0.55)]"
    >
      {FRAMEWORK_ICONS[framework]}
      {FRAMEWORK_LABELS[framework]}
      <ArrowRightIcon
        size={13}
        className="text-ep-soft ml-auto transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function PathCard({ path }: { path: (typeof DOCS_OVERVIEW_PATHS)[number] }) {
  const tone = TONES[path.id];

  return (
    <article
      className={`flex min-w-0 flex-col overflow-hidden rounded-[24px] border p-[clamp(20px,2.5vw,30px)] ${tone.card}`}
    >
      <span
        className={`font-display inline-flex self-start rounded-full px-3 py-1.5 text-[12px] font-extrabold tracking-[0.01em] ${tone.badge}`}
      >
        {path.eyebrow}
      </span>

      <div className="mt-5 grid flex-1 items-center gap-6 min-[980px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex items-center justify-center rounded-[18px] bg-white/55 px-3 py-4">
          <Image
            src={path.illustration}
            alt=""
            width={360}
            height={280}
            className="h-auto w-full max-w-[310px]"
          />
        </div>
        <div>
          <h2 className="font-display text-ep-navy m-0 text-[clamp(22px,2.2vw,28px)] font-extrabold leading-[1.15] tracking-[-0.02em]">
            {path.title}
          </h2>
          <p className="text-ep-slate mt-3 max-w-[38ch] font-sans text-[15px] leading-[1.55]">
            {path.description}
          </p>
          <ul className="mt-5 flex list-none flex-col gap-2.5 p-0">
            {path.features.map((feature) => (
              <li
                key={feature}
                className="text-ep-navy flex items-center gap-2.5 font-sans text-[14px] font-semibold"
              >
                <Check tone={path.id} />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {path.frameworks ? (
        <div className="mt-6 grid grid-cols-2 gap-2 border-t border-[rgba(7,32,76,0.08)] pt-5 sm:grid-cols-4 min-[980px]:grid-cols-2">
          {path.frameworks.map((framework) => (
            <FrameworkLink key={framework} framework={framework} />
          ))}
        </div>
      ) : (
        <Link
          href={path.href}
          className={`font-display group mt-6 inline-flex items-center justify-center gap-2 rounded-[11px] border bg-white/70 px-4 py-3 text-[14px] font-extrabold no-underline transition-all ${tone.link}`}
        >
          {path.cta}
          <ArrowRightIcon size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </article>
  );
}

function EngineFoundation() {
  return (
    <section className="relative mt-7 overflow-hidden rounded-[24px] border border-[#B9E4DE] bg-[linear-gradient(135deg,#ECFAF8_0%,#F5FBFF_58%,#F2F0FF_100%)] p-[clamp(22px,3vw,36px)]">
      <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[#20B8A5]/10" />
      <div className="relative grid items-center gap-8 min-[900px]:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div>
          <span className="font-display inline-flex items-center gap-2 rounded-full bg-[#DDF5F1] px-3 py-1.5 text-[12px] font-extrabold text-[#087F73]">
            <EngineIcon size={16} />
            {DOCS_ENGINE_FOUNDATION.eyebrow}
          </span>
          <h2 className="font-display text-ep-navy mb-0 mt-5 text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.1] tracking-[-0.025em]">
            {DOCS_ENGINE_FOUNDATION.title}
          </h2>
          <p className="text-ep-slate mt-4 max-w-[62ch] font-sans text-[16px] leading-[1.65]">
            {DOCS_ENGINE_FOUNDATION.description}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {DOCS_ENGINE_FOUNDATION.features.map((feature) => (
              <span
                key={feature}
                className="border-ep-border rounded-full border bg-white/80 px-3 py-1.5 font-sans text-[13px] font-bold text-[#31516B]"
              >
                {feature}
              </span>
            ))}
          </div>
          <Link
            href={DOCS_ENGINE_FOUNDATION.href}
            className="font-display group mt-6 inline-flex items-center gap-2 rounded-[11px] bg-[#087F73] px-4 py-3 text-[14px] font-extrabold text-white no-underline transition hover:bg-[#066A61]"
          >
            {DOCS_ENGINE_FOUNDATION.cta}
            <ArrowRightIcon
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>

        <div className="flex flex-col items-center rounded-[20px] border border-white/90 bg-white/70 p-5 shadow-[0_20px_40px_-30px_rgba(7,32,76,0.28)]">
          <div className="grid w-full grid-cols-2 gap-3">
            {DOCS_OVERVIEW_PATHS.map((path) => (
              <div
                key={path.id}
                className="border-ep-border font-display text-ep-navy flex min-h-[72px] items-center justify-center rounded-[13px] border bg-white px-3 text-center text-[14px] font-extrabold"
              >
                {path.title}
              </div>
            ))}
          </div>
          <div className="h-7 w-px bg-[#8ECFC6]" />
          <div className="flex w-full items-center justify-center gap-3 rounded-[15px] border border-[#A9DED7] bg-[#E5F7F4] px-4 py-4 text-[#087F73]">
            <EngineIcon size={28} />
            <span className="font-display text-[17px] font-extrabold">Shared Engine contract</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DocsOverview() {
  return (
    <div className="not-prose pb-8 pt-7">
      <header className="mx-auto max-w-[820px] text-center">
        <span className="font-display text-ep-blue text-[12px] font-extrabold uppercase tracking-[0.14em]">
          EmbedPDF Documentation
        </span>
        <h1 className="font-display text-ep-navy mb-0 mt-5 text-[clamp(38px,5vw,60px)] font-extrabold leading-[1.04] tracking-[-0.035em]">
          Build PDF experiences <span className="ep-grad">your way.</span>
        </h1>
        <p className="text-ep-body mx-auto mt-5 max-w-[650px] font-sans text-[18px] leading-[1.65]">
          Start with a complete viewer, compose your own interface, or work directly with the engine
          underneath.
        </p>
      </header>

      <div className="mt-[clamp(36px,5vw,58px)] grid items-stretch gap-5 min-[760px]:grid-cols-2">
        {DOCS_OVERVIEW_PATHS.map((path) => (
          <PathCard key={path.id} path={path} />
        ))}
      </div>

      <EngineFoundation />
    </div>
  );
}
