import {
  Attachment01Icon,
  Bookmark02Icon,
  FileEditIcon,
  Files02Icon,
  HelpCircleIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  PRIVACY_LINE,
  TOOLS,
  TOOLS_INDEX,
  toolInfo,
  type ToolPageCopy,
  type ToolSlug,
} from '../content';
import { TOOL_ANCHOR } from './tool-anchor';

import { EpButton } from '@/components/site/button';
import { Eyebrow, PillDivider } from '@/components/site/eyebrow';
import { CodeWindow } from '@/components/site/framework-page/code-window';
import { ArrowRightIcon, ShieldCheckIcon } from '@/components/site/icons';
import { SITE_ORIGIN } from '@/lib/site';

const ICONS = {
  'pdf-merge': Files02Icon,
  'pdf-metadata-editor': FileEditIcon,
  'pdf-outline-editor': Bookmark02Icon,
  'pdf-attachment-editor': Attachment01Icon,
} satisfies Record<ToolSlug, unknown>;

export function ToolIcon({ slug, size = 22 }: { slug: ToolSlug; size?: number }) {
  return <HugeiconsIcon icon={ICONS[slug]} size={size} strokeWidth={2} />;
}

const WIDTH = 'mx-auto w-full px-[clamp(20px,4vw,80px)]';

/**
 * Structured data for search: the page as a free web app, its questions, and where it sits on
 * the site. Every string is the page's own copy.
 */
function ToolJsonLd({ copy }: { copy: ToolPageCopy }) {
  const tool = toolInfo(copy.slug);
  const url = `${SITE_ORIGIN}${tool.href}`;
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: tool.name,
      description: copy.metaDescription,
      url,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript and WebAssembly',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: copy.questions.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'EmbedPDF', item: SITE_ORIGIN },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Open source PDF tools',
          item: `${SITE_ORIGIN}/tools`,
        },
        { '@type': 'ListItem', position: 3, name: tool.name, item: url },
      ],
    },
  ];
  return (
    <script
      type="application/ld+json"
      // The copy is ours, but `<` is escaped anyway so no string can close the tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

/**
 * The heading, the tool itself, and the one line about privacy. A tool step that shows a viewer
 * marks itself `data-tool-wide`, and the column widens for it: the viewer docks its panels from
 * 1024 px.
 */
function ToolHero({ copy, children }: { copy: ToolPageCopy; children: ReactNode }) {
  return (
    <section className="relative w-full pb-[clamp(56px,7vw,96px)] pt-[clamp(40px,5vw,72px)]">
      <div className={`${WIDTH} max-w-[1040px] has-[[data-tool-wide]]:max-w-[1320px]`}>
        <nav aria-label="Breadcrumb" className="mb-5 flex justify-center">
          <Link
            href="/tools"
            className="text-ep-soft hover:text-ep-blue font-sans text-sm font-medium transition-colors"
          >
            Open source PDF tools
          </Link>
        </nav>
        <div className="flex flex-col items-center text-center">
          <h1 className="font-display text-ep-navy m-0 text-[clamp(36px,5vw,58px)] font-extrabold leading-[1.05] tracking-[-0.02em] [text-wrap:balance]">
            {copy.heading.lead} <em className="ep-grad not-italic">{copy.heading.accent}</em>
          </h1>
          <p className="text-ep-muted mb-0 mt-4 max-w-[560px] font-sans text-[17px] leading-[1.6]">
            {copy.lede}
          </p>
        </div>
        <div
          id={TOOL_ANCHOR}
          className="border-ep-border mt-[clamp(28px,4vw,44px)] scroll-mt-[100px] rounded-[22px] border bg-white p-[clamp(14px,2.2vw,24px)] shadow-[0_24px_60px_-34px_rgba(7,32,76,0.35)]"
        >
          {children}
        </div>
        <p className="text-ep-soft mt-4 flex items-center justify-center gap-2 font-sans text-sm">
          <ShieldCheckIcon size={16} className="text-ep-blue" />
          {PRIVACY_LINE}
        </p>
      </div>
    </section>
  );
}

function HowItWorks({ steps }: { steps: ToolPageCopy['steps'] }) {
  return (
    <section className="border-ep-border w-full border-t bg-white py-[clamp(56px,7vw,96px)]">
      <div className={`${WIDTH} max-w-[1120px]`}>
        <h2 className="font-display text-ep-navy m-0 text-center text-[clamp(28px,3.4vw,40px)] font-extrabold tracking-[-0.02em]">
          How it works
        </h2>
        <ol className="m-0 mt-[clamp(28px,4vw,48px)] grid list-none gap-5 p-0 min-[761px]:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="border-ep-border bg-ep-bg rounded-2xl border p-6">
              <span className="bg-ep-mist text-ep-blue700 font-display inline-flex h-9 w-9 items-center justify-center rounded-full text-base font-extrabold">
                {index + 1}
              </span>
              <h3 className="font-display text-ep-navy mb-2 mt-4 text-lg font-bold">
                {step.title}
              </h3>
              <p className="text-ep-muted m-0 font-sans text-[15px] leading-[1.6]">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Questions({ questions }: { questions: ToolPageCopy['questions'] }) {
  return (
    <section className="bg-ep-bg w-full py-[clamp(56px,7vw,110px)]">
      <div
        className={`${WIDTH} grid max-w-[1200px] items-start gap-[clamp(32px,5vw,80px)] min-[1025px]:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]`}
      >
        <div className="flex flex-col items-start min-[1025px]:sticky min-[1025px]:top-[120px]">
          <div className="mb-5">
            <Eyebrow
              icon={
                <HugeiconsIcon
                  icon={HelpCircleIcon}
                  size={14}
                  strokeWidth={2}
                  className="text-ep-blue"
                />
              }
            >
              FAQ
            </Eyebrow>
          </div>
          <h2 className="font-display text-ep-navy m-0 mb-[18px] text-[clamp(28px,3.4vw,40px)] font-extrabold leading-[1.1] tracking-[-0.02em]">
            Questions people ask
          </h2>
          <PillDivider gradient />
        </div>
        <div className="flex flex-col gap-3">
          {questions.map((item, index) => (
            <details
              key={item.question}
              open={index === 0}
              className="border-ep-border group rounded-2xl border bg-white transition-all duration-200 open:border-[rgba(8,118,253,0.28)] open:bg-[#FBFCFF] hover:border-[rgba(8,118,253,0.28)]"
            >
              <summary className="font-display text-ep-navy flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 text-[17px] font-bold leading-[1.35] outline-none focus-visible:shadow-[0_0_0_2px_#0876FD] [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden
                  className="text-ep-blue inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(8,118,253,0.08)] transition-transform duration-200 group-open:rotate-45"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="text-ep-muted -mt-1 mb-0 px-6 pb-6 font-sans text-[15.5px] leading-[1.65]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Why the tools are on embedpdf.com: the calls this tool makes, for a developer to reuse. */
async function Developer({ developer }: { developer: ToolPageCopy['developer'] }) {
  return (
    <section className="bg-ep-navy w-full py-[clamp(56px,7vw,110px)] text-white">
      <div
        className={`${WIDTH} grid max-w-[1200px] items-center gap-[clamp(32px,5vw,72px)] min-[1025px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]`}
      >
        <div className="flex flex-col items-start gap-5">
          <Eyebrow tone="dark">For developers</Eyebrow>
          <h2 className="font-display m-0 text-[clamp(28px,3.4vw,42px)] font-extrabold leading-[1.1] tracking-[-0.02em]">
            {developer.title}
          </h2>
          <p className="text-ep-faint m-0 max-w-[520px] font-sans text-[17px] leading-[1.6]">
            {developer.body}
          </p>
          <div className="flex flex-wrap gap-3.5">
            <EpButton href={developer.docs.href}>{developer.docs.label}</EpButton>
            <Link
              href="/demo"
              className="inline-flex h-[50px] items-center rounded-[10px] border-2 border-white/25 px-[22px] font-sans text-base font-bold text-white transition-colors hover:border-white/50 hover:bg-white/10"
            >
              Try the viewer
            </Link>
          </div>
        </div>
        <div className="min-w-0">
          <CodeWindow
            file={{ filename: developer.filename, language: 'ts', code: developer.code }}
          />
        </div>
      </div>
    </section>
  );
}

/** Cards for the tools: on /tools all of them, under a tool the others. */
export function ToolCards({ except }: { except?: ToolSlug }) {
  const tools = TOOLS.filter((tool) => tool.slug !== except);
  return (
    <ul
      className={`m-0 grid list-none gap-4 p-0 ${tools.length === 4 ? 'min-[761px]:grid-cols-2' : 'min-[761px]:grid-cols-3'}`}
    >
      {tools.map((tool) => (
        <li key={tool.slug}>
          <Link
            href={tool.href}
            className="border-ep-border hover:border-ep-blue group flex h-full flex-col gap-3 rounded-2xl border bg-white p-6 transition-all duration-150 hover:shadow-[0_18px_40px_-26px_rgba(8,118,253,0.45)]"
          >
            <span className="bg-ep-mist text-ep-blue inline-flex h-11 w-11 items-center justify-center rounded-xl">
              <ToolIcon slug={tool.slug} />
            </span>
            <span className="font-display text-ep-navy group-hover:text-ep-blue text-lg font-bold transition-colors">
              {tool.name}
            </span>
            <span className="text-ep-muted font-sans text-[15px] leading-[1.55]">
              {tool.summary}
            </span>
            <span className="text-ep-blue mt-auto inline-flex items-center gap-1.5 pt-1 font-sans text-sm font-bold">
              Open the tool <ArrowRightIcon size={16} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function OtherTools({ current }: { current: ToolSlug }) {
  return (
    <section className="bg-ep-bg w-full py-[clamp(56px,7vw,96px)]">
      <div className={`${WIDTH} max-w-[1120px]`}>
        <h2 className="font-display text-ep-navy m-0 mb-[clamp(24px,3vw,36px)] text-center text-[clamp(26px,3vw,36px)] font-extrabold tracking-[-0.02em]">
          More open source PDF tools
        </h2>
        <ToolCards except={current} />
      </div>
    </section>
  );
}

/**
 * A tool page, top to bottom: the tool where a visitor lands, then what search and a curious
 * reader need (how it works, questions), then the developer pitch, then the other tools. Only
 * the tool runs in the browser; everything else is in the HTML.
 */
export function ToolPage({ copy, children }: { copy: ToolPageCopy; children: ReactNode }) {
  return (
    <main className="bg-ep-bg relative overflow-x-clip">
      <ToolJsonLd copy={copy} />
      <ToolHero copy={copy}>{children}</ToolHero>
      <HowItWorks steps={copy.steps} />
      <Questions questions={copy.questions} />
      <Developer developer={copy.developer} />
      <OtherTools current={copy.slug} />
    </main>
  );
}

/** The /tools page: every tool as a card. */
export function ToolsIndex() {
  return (
    <main className="bg-ep-bg relative overflow-x-clip">
      <section className="w-full pb-[clamp(64px,8vw,120px)] pt-[clamp(48px,6vw,96px)]">
        <div className={`${WIDTH} max-w-[1040px]`}>
          <div className="mb-[clamp(32px,4vw,56px)] flex flex-col items-center text-center">
            <h1 className="font-display text-ep-navy m-0 text-[clamp(36px,5vw,58px)] font-extrabold leading-[1.05] tracking-[-0.02em] [text-wrap:balance]">
              {TOOLS_INDEX.heading.lead}{' '}
              <em className="ep-grad not-italic">{TOOLS_INDEX.heading.accent}</em>
            </h1>
            <p className="text-ep-muted mb-0 mt-4 max-w-[600px] font-sans text-[17px] leading-[1.6]">
              {TOOLS_INDEX.lede}
            </p>
            <p className="text-ep-soft mb-0 mt-4 flex items-center gap-2 font-sans text-sm">
              <ShieldCheckIcon size={16} className="text-ep-blue" />
              {PRIVACY_LINE}
            </p>
          </div>
          <ToolCards />
        </div>
      </section>
    </main>
  );
}
