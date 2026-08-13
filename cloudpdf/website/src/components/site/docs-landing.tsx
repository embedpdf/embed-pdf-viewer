import Link from 'next/link';
import type { ReactNode } from 'react';

import { getOperationCount, getSdkLanguages } from '@/lib/api-reference';
import {
  DOCS_INTEGRATION_LABELS,
  docsGettingStartedHref,
  PRODUCT_INTEGRATIONS,
  type DocsIntegration,
  type FanoutDocsProduct,
} from '@/lib/docs-integrations';

import { BackendBand } from './backend-band';
import { ArrowRight, CheckIcon, CloudIcon } from './icons';
import { IntegrationLogo } from './integration-logo';

type Tone = 'blue' | 'violet';

const toneStyles: Record<
  Tone,
  {
    iconBox: string;
    check: string;
    lead: string;
    hover: string;
    fwLink: string;
    arrow: string;
    panel: string;
  }
> = {
  blue: {
    iconBox: 'bg-[#E7F0FF] text-cp-blue',
    check: 'bg-[#E7F0FF] text-cp-blue',
    lead: 'text-cp-blue',
    hover: 'hover:border-[#CFE0FF] hover:shadow-[0_30px_60px_-34px_rgba(22,119,255,0.3)]',
    fwLink:
      'border-[#D7E5FF] bg-[#F2F8FF] hover:border-cp-blue hover:bg-white hover:shadow-[0_12px_24px_-12px_rgba(22,119,255,0.55)]',
    arrow: 'text-cp-blue',
    panel: 'bg-[#F4F7FE]',
  },
  violet: {
    iconBox: 'bg-[#F0ECFF] text-cp-violet',
    check: 'bg-[#F0ECFF] text-cp-violet',
    lead: 'text-cp-violet',
    hover: 'hover:border-[#DAD0FF] hover:shadow-[0_30px_60px_-34px_rgba(124,92,252,0.3)]',
    fwLink:
      'border-[#E2DAFF] bg-[#F7F4FF] hover:border-cp-violet hover:bg-white hover:shadow-[0_12px_24px_-12px_rgba(124,92,252,0.55)]',
    arrow: 'text-cp-violet',
    panel: 'bg-[#F5F4FE]',
  },
};

function FrameworkLink({
  product,
  integration,
  tone,
}: {
  product: FanoutDocsProduct;
  integration: DocsIntegration;
  tone: Tone;
}) {
  const s = toneStyles[tone];
  return (
    <Link
      href={docsGettingStartedHref(product, integration)}
      className={`group flex items-center gap-2.5 rounded-xl border px-3 py-3 no-underline transition-all ${s.fwLink} ${
        integration === 'vanilla' ? 'col-span-2' : ''
      }`}
    >
      <span className="inline-flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-white shadow-[0_1px_2px_rgba(10,26,77,0.06)] transition-colors">
        <IntegrationLogo integration={integration} size={20} />
      </span>
      <span className="font-display text-cp-navy min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.01em]">
        {DOCS_INTEGRATION_LABELS[integration]}
      </span>
      <ArrowRight
        width={18}
        height={18}
        strokeWidth={2.4}
        className={`flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${s.arrow}`}
      />
    </Link>
  );
}

function PathCard({
  tone,
  product,
  title,
  desc,
  feats,
  image,
  imageAlt,
}: {
  tone: Tone;
  product: FanoutDocsProduct;
  title: string;
  desc: string;
  feats: ReactNode[];
  image: string;
  imageAlt: string;
}) {
  const s = toneStyles[tone];
  return (
    <div
      className={`border-cp-border flex min-w-0 flex-col rounded-[22px] border bg-white p-[34px] pb-7 shadow-[0_1px_2px_rgba(10,26,77,0.04),0_22px_48px_-32px_rgba(10,26,77,0.22)] transition-all ${s.hover}`}
    >
      <div className="grid grid-cols-2 items-center gap-x-7 max-[520px]:grid-cols-1 max-[520px]:gap-y-5">
        <div
          className={`flex items-center justify-center overflow-hidden rounded-[16px] p-4 ${s.panel}`}
        >
          <img src={image} alt={imageAlt} loading="lazy" className="block h-auto w-full" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-cp-navy text-[24px] font-extrabold leading-[1.1] tracking-[-0.02em]">
            {title}
          </div>
          <p className="text-cp-muted mt-2.5 font-sans text-[15px] leading-[1.55]">{desc}</p>

          <div className="mt-[16px] flex flex-col gap-[10px]">
            {feats.map((feat, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span
                  className={`inline-flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-full ${s.check}`}
                >
                  <CheckIcon width={12} height={12} />
                </span>
                <span className="text-cp-ink [&_b]:text-cp-navy font-sans text-[15px] leading-[1.45] [&_b]:font-bold">
                  {feat}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pinned to the bottom: the two cards list a different number of
          integrations, so the leftover height falls above the divider and both
          framework grids still line up. */}
      <div className="mt-7 flex flex-1 flex-col justify-end">
        <div className="border-cp-borderSoft flex items-center gap-2.5 border-t pt-6">
          <span
            className={`inline-flex flex-shrink-0 ${tone === 'blue' ? 'text-cp-blue' : 'text-cp-violet'}`}
          >
            <svg
              width={17}
              height={17}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m18 16 4-4-4-4" />
              <path d="m6 8-4 4 4 4" />
              <path d="m14.5 4-5 16" />
            </svg>
          </span>
          <span className="font-display text-cp-navy text-sm font-bold tracking-[-0.01em]">
            Get started in your framework
          </span>
        </div>
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          {PRODUCT_INTEGRATIONS[product].map((integration) => (
            <FrameworkLink
              key={integration}
              product={product}
              integration={integration}
              tone={tone}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DeployCard({
  tone,
  icon,
  title,
  lead,
  sub,
  href,
}: {
  tone: Tone;
  icon: ReactNode;
  title: string;
  lead: string;
  sub: string;
  href: string;
}) {
  const s = toneStyles[tone];
  return (
    <Link
      href={href}
      className={`border-cp-border group flex items-center gap-[18px] rounded-[18px] border bg-white px-6 py-[22px] no-underline shadow-[0_1px_2px_rgba(10,26,77,0.04),0_18px_40px_-32px_rgba(10,26,77,0.18)] transition-all ${s.hover}`}
    >
      <span
        className={`inline-flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[14px] ${s.iconBox}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-cp-navy text-[18px] font-extrabold tracking-[-0.01em]">
          {title}
        </div>
        <div className={`mt-1 font-sans text-sm font-semibold ${s.lead}`}>{lead}</div>
        <div className="text-cp-muted mt-0.5 font-sans text-[13.5px] leading-[1.45]">{sub}</div>
      </div>
      <ArrowRight
        width={22}
        height={22}
        strokeWidth={2.4}
        className={`flex-shrink-0 transition-transform group-hover:translate-x-1 ${
          tone === 'blue' ? 'text-cp-blue' : 'text-cp-violet'
        }`}
      />
    </Link>
  );
}

export function DocsLanding() {
  return (
    <section className="relative py-[clamp(40px,5vw,56px)]">
      <div className="relative mx-auto w-full max-w-[1440px]">
        {/* heading */}
        <div className="mx-auto max-w-[880px] text-center">
          <h1 className="font-display text-cp-navy text-balance text-[clamp(38px,5vw,60px)] font-extrabold leading-[1.06] tracking-[-0.03em]">
            Choose the right path to build better{' '}
            <em className="text-cp-blue not-italic">PDF experiences.</em>
          </h1>
          <p className="text-cp-ink mx-auto mt-[22px] max-w-[560px] font-sans text-[19px] leading-[1.6]">
            Launch faster with a ready-made viewer, or build exactly what you need with our headless
            components.
          </p>
        </div>

        {/* path pill */}
        <div className="mt-[clamp(40px,5vw,64px)] flex justify-center">
          <span className="font-display text-cp-blue relative z-[2] inline-flex items-center gap-2.5 rounded-full border border-[#D4E4FF] bg-white px-[22px] py-[13px] text-base font-extrabold tracking-[-0.01em] shadow-[0_8px_22px_-14px_rgba(22,119,255,0.4),0_1px_2px_rgba(10,26,77,0.05)]">
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0"
            >
              <rect x="9" y="3" width="6" height="6" rx="1.5" />
              <rect x="3" y="15" width="6" height="6" rx="1.5" />
              <rect x="15" y="15" width="6" height="6" rx="1.5" />
              <path d="M12 9v3M12 12H6v3M12 12h6v3" />
            </svg>
            Choose your implementation path
          </span>
        </div>

        {/* paths */}
        <div className="relative mt-[clamp(36px,4.5vw,56px)] grid grid-cols-1 gap-y-3.5 min-[881px]:grid-cols-2 min-[881px]:gap-x-[clamp(18px,2.2vw,34px)] min-[881px]:gap-y-0">
          <PathCard
            tone="blue"
            product="viewer"
            image="/plan-section/ready-made-viewer.svg"
            imageAlt="Preview of the ready-made PDF viewer interface"
            title="Ready-made Viewer"
            desc="Embed a complete, feature-rich PDF viewer in minutes."
            feats={['Drop-in component', 'Fastest way to launch', 'Prebuilt toolbar and layout']}
          />

          <PathCard
            tone="violet"
            product="headless"
            image="/plan-section/headless-components.svg"
            imageAlt="Headless components and code building blocks"
            title="Headless Components"
            desc="Build custom PDF experiences with our modular, headless API."
            feats={['Build your own UI', 'Full composability', 'Plugin-friendly']}
          />
        </div>

        {/* deployment label */}
        <div className="mb-[clamp(28px,3.5vw,42px)] mt-[clamp(48px,6vw,80px)] flex justify-center">
          <span className="border-cp-border font-display text-cp-muted inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border bg-[#F1F5FC] px-3.5 py-1.5 text-[12.5px] font-bold tracking-[0.01em]">
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[#9AA9C7]"
            >
              <path d="M12 2 2 7l10 5 10-5-10-5z" />
              <path d="m2 17 10 5 10-5" />
              <path d="m2 12 10 5 10-5" />
            </svg>
            Choose your deployment
          </span>
        </div>

        {/* deployment */}
        <div className="grid grid-cols-1 gap-3.5 min-[881px]:grid-cols-2 min-[881px]:gap-x-[clamp(18px,2.2vw,34px)]">
          <DeployCard
            tone="blue"
            icon={<CloudIcon width={28} height={28} strokeWidth={1.9} />}
            title="Managed SaaS"
            lead="We host and manage everything."
            sub="Get secure, scalable infrastructure so you can focus on your product."
            href="/docs/engine/getting-started"
          />
          <DeployCard
            tone="violet"
            icon={
              <svg
                width={26}
                height={26}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="6" rx="1.5" />
                <rect x="3" y="14" width="18" height="6" rx="1.5" />
                <path d="M7 7h.01M7 17h.01" />
              </svg>
            }
            title="Self-hosted Server"
            lead="Deploy in your own environment."
            sub="Full control, private data, and enterprise compliance on your terms."
            href="/docs/server/getting-started"
          />
        </div>

        <BackendBand
          languages={getSdkLanguages().map(({ language, label }) => ({ language, label }))}
          operationCount={getOperationCount()}
        />
      </div>
    </section>
  );
}
