import {
  Book02Icon,
  CpuIcon,
  FileImportIcon,
  Image02Icon,
  Search01Icon,
  TaskEdit01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Eyebrow } from '@/components/site/eyebrow';
import {
  AngularIcon,
  ArrowRightIcon,
  ExtLinkIcon,
  JsMark,
  ReactIcon,
  SvelteIcon,
  VueIcon,
} from '@/components/site/icons';
import {
  DOCS_INTEGRATION_LABELS,
  type DocsIntegration,
  type HeadlessIntegration,
} from '@/lib/docs-integrations';
import { DOCS_ENGINE_FOUNDATION, DOCS_OVERVIEW_PATHS } from '@/lib/docs-overview';

const HEADLESS_INTEGRATION_ICONS: Record<HeadlessIntegration, ReactNode> = {
  react: <ReactIcon size={18} />,
  vue: <VueIcon size={18} />,
  svelte: <SvelteIcon size={17} />,
  angular: <AngularIcon size={18} />,
};

const INTEGRATION_ICONS: Record<DocsIntegration, ReactNode> = {
  vanilla: <JsMark small />,
  ...HEADLESS_INTEGRATION_ICONS,
};

const TONES = {
  viewer: {
    accent: '#0876FD',
    card: 'border-[#BFD8FB] bg-[#ECF3FE]',
    badge: 'bg-[#DDEBFF] text-[#075FCB]',
    check: 'bg-[#DCEBFF] text-[#0876FD]',
  },
  headless: {
    accent: '#9747FF',
    card: 'border-[#D9C8F8] bg-[#F5F0FE]',
    badge: 'bg-[#ECE2FB] text-[#6A2BC9]',
    check: 'bg-[#EDE3FC] text-[#7C3AED]',
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

function IntegrationLink({
  integration,
  product,
}: {
  integration: DocsIntegration;
  product: 'viewer' | 'headless';
}) {
  const isViewer = product === 'viewer';
  return (
    <Link
      href={`/docs/${product}/${integration}/getting-started`}
      className={`border-ep-border text-ep-navy group inline-flex items-center gap-2 rounded-[10px] border bg-white px-3 py-2 font-sans text-[13px] font-bold no-underline transition-all hover:-translate-y-0.5 ${
        isViewer
          ? 'hover:border-ep-blue hover:shadow-[0_12px_24px_-16px_rgba(8,118,253,0.55)]'
          : 'hover:border-ep-purple hover:shadow-[0_12px_24px_-16px_rgba(124,58,237,0.55)]'
      }`}
    >
      {INTEGRATION_ICONS[integration]}
      {DOCS_INTEGRATION_LABELS[integration]}
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

      <div className="mb-7 mt-5 grid items-start gap-6 min-[980px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex h-[180px] items-center justify-center rounded-[18px] bg-white/55 px-3">
          <Image
            src={path.illustration}
            alt=""
            width={360}
            height={280}
            className="h-full w-auto max-w-full object-contain"
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

      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[rgba(7,32,76,0.08)] pt-5 sm:grid-cols-3">
        {path.integrations.map((integration) => (
          <IntegrationLink key={integration} integration={integration} product={path.id} />
        ))}
      </div>
    </article>
  );
}

const ENGINE_FEATURE_ICONS: ReactNode[] = [
  <HugeiconsIcon key="io" icon={FileImportIcon} size={17} strokeWidth={2} />,
  <HugeiconsIcon key="render" icon={Image02Icon} size={17} strokeWidth={2} />,
  <HugeiconsIcon key="search" icon={Search01Icon} size={17} strokeWidth={2} />,
  <HugeiconsIcon key="forms" icon={TaskEdit01Icon} size={17} strokeWidth={2} />,
];

function EngineFoundation() {
  const titleWords = DOCS_ENGINE_FOUNDATION.title.split(' ');

  return (
    <section className="relative mt-[clamp(52px,8vw,96px)]">
      <div className="flex justify-center">
        <Eyebrow
          icon={<HugeiconsIcon icon={CpuIcon} size={14} strokeWidth={2} className="text-ep-blue" />}
        >
          {DOCS_ENGINE_FOUNDATION.eyebrow}
        </Eyebrow>
      </div>
      <div className="relative mt-[clamp(24px,3.5vw,44px)] grid items-center gap-[clamp(20px,4vw,56px)] min-[900px]:grid-cols-[minmax(0,0.82fr)_minmax(340px,1.18fr)]">
        {/* Illustration */}
        <div className="relative flex items-center justify-center">
          <div
            className="pointer-events-none absolute left-1 top-2 grid grid-cols-6 gap-1.5 opacity-50"
            aria-hidden
          >
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i} className="h-1 w-1 rounded-full bg-[#B7D2F8]" />
            ))}
          </div>
          <Image
            src={DOCS_ENGINE_FOUNDATION.illustration}
            alt="EmbedPDF Engine — PDFium powered"
            width={520}
            height={572}
            className="relative h-auto w-full max-w-[260px] drop-shadow-[0_24px_44px_-32px_rgba(8,118,253,0.35)]"
          />
        </div>

        {/* Content */}
        <div>
          <h2 className="font-display text-ep-navy mb-0 mt-0 text-[clamp(22px,2.2vw,28px)] font-extrabold leading-[1.15] tracking-[-0.02em]">
            {titleWords.map((word, i) => (
              <span key={word} className={i === titleWords.length - 1 ? 'text-ep-blue' : undefined}>
                {i > 0 ? ' ' : ''}
                {word}
              </span>
            ))}
          </h2>
          <p className="text-ep-slate mt-2.5 max-w-[52ch] font-sans text-[15px] leading-[1.55]">
            {DOCS_ENGINE_FOUNDATION.description}
          </p>

          <ul className="mt-4 flex list-none flex-col gap-2.5 p-0">
            {DOCS_ENGINE_FOUNDATION.features.map((feature, i) => (
              <li
                key={feature}
                className="text-ep-navy flex items-center gap-2.5 font-sans text-[14px] font-semibold"
              >
                <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] bg-[#EDF3FC] text-[#3E7BD6]">
                  {ENGINE_FEATURE_ICONS[i]}
                </span>
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href={DOCS_ENGINE_FOUNDATION.href}
              className="font-display bg-ep-blue group inline-flex items-center gap-2 rounded-[11px] px-4 py-2.5 text-[14px] font-extrabold text-white no-underline transition hover:bg-[#0665D8] hover:shadow-[0_14px_26px_-18px_rgba(8,118,253,0.7)]"
            >
              {DOCS_ENGINE_FOUNDATION.cta}
              <ArrowRightIcon
                size={15}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href={DOCS_ENGINE_FOUNDATION.apiHref}
              className="font-display text-ep-blue group inline-flex items-center gap-1.5 text-[14px] font-extrabold no-underline transition hover:text-[#0665D8]"
            >
              {DOCS_ENGINE_FOUNDATION.apiCta}
              <ExtLinkIcon size={12} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DocsOverview() {
  return (
    <div className="not-prose pb-8 pt-[clamp(28px,5vw,72px)]">
      <header className="mx-auto max-w-[760px] text-center">
        <div className="flex justify-center">
          <Eyebrow
            icon={
              <HugeiconsIcon icon={Book02Icon} size={14} strokeWidth={2} className="text-ep-blue" />
            }
          >
            EmbedPDF Documentation
          </Eyebrow>
        </div>
        <h1 className="font-display text-ep-navy mx-auto mb-0 mt-5 max-w-[16ch] text-balance text-[clamp(34px,4.4vw,50px)] font-extrabold leading-[1.06] tracking-[-0.03em]">
          Build PDF experiences <span className="ep-grad">your way.</span>
        </h1>
        <p className="text-ep-body mx-auto mt-5 max-w-[620px] font-sans text-[18px] leading-[1.65]">
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
