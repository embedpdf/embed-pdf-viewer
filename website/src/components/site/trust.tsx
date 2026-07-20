import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { EpButton } from './button';
import { DotGrid } from './dot-grid';
import { Eyebrow } from './eyebrow';
import { ArrowRightIcon, ExtLinkIcon, GitHubIcon, ShieldCheckIcon } from './icons';

function NpmMark({ size = 52 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.5} viewBox="-90 -90 960 380" aria-hidden className="block">
      <rect x="-90" y="-90" width="960" height="380" fill="#CB3837" rx="32" />
      <path
        fill="#fff"
        d="M240,250h100v-50h100V0H240V250z M340,50h50v100h-50V50z M480,0v200h100V50h50v150h50V50h50v150h50V0H480z M0,200h100V50h50v150h50V0H0V200z"
      />
    </svg>
  );
}

function SparkLine() {
  return (
    <svg
      className="block min-h-[110px] w-full flex-1"
      viewBox="0 0 320 110"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="epSparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(8, 118, 253, 0.28)" />
          <stop offset="60%" stopColor="rgba(151, 71, 255, 0.10)" />
          <stop offset="100%" stopColor="rgba(151, 71, 255, 0)" />
        </linearGradient>
        <linearGradient id="epSparkStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0876FD" />
          <stop offset="100%" stopColor="#9747FF" />
        </linearGradient>
      </defs>
      <line
        x1="0"
        y1="30"
        x2="320"
        y2="30"
        stroke="#E9EEFF"
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      <line
        x1="0"
        y1="60"
        x2="320"
        y2="60"
        stroke="#E9EEFF"
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      <line
        x1="0"
        y1="90"
        x2="320"
        y2="90"
        stroke="#E9EEFF"
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      <path
        d="M 0 92 C 28 90 50 86 80 80 C 110 74 134 66 160 56 C 188 46 214 36 244 26 C 270 18 296 12 320 8 L 320 110 L 0 110 Z"
        fill="url(#epSparkFill)"
      />
      <path
        d="M 0 92 C 28 90 50 86 80 80 C 110 74 134 66 160 56 C 188 46 214 36 244 26 C 270 18 296 12 320 8"
        fill="none"
        stroke="url(#epSparkStroke)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="320" cy="8" r="5" fill="#fff" stroke="#9747FF" strokeWidth="2.4" />
    </svg>
  );
}

const CARD_BASE =
  'relative flex flex-col gap-4 rounded-2xl border border-ep-border bg-white p-[22px_22px_20px] ' +
  'shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_1px_2px_rgba(7,32,76,0.04),0_12px_32px_-18px_rgba(7,32,76,0.10)] ' +
  'transition-all duration-200 hover:-translate-y-[3px] hover:border-[rgba(8,118,253,0.30)] ' +
  'hover:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_4px_rgba(7,32,76,0.06),0_22px_44px_-18px_rgba(8,118,253,0.22)]';

function CardHead({
  iconBg,
  icon,
  stat,
  label,
  featured = false,
}: {
  iconBg: string;
  icon: ReactNode;
  stat: string;
  label: string;
  featured?: boolean;
}) {
  return (
    <header
      className={`grid items-center gap-4 ${featured ? 'grid-cols-[72px_1fr]' : 'grid-cols-[64px_1fr]'}`}
    >
      <div
        className={`inline-flex items-center justify-center ${featured ? 'h-[72px] w-[72px] rounded-2xl' : 'h-16 w-16 rounded-[14px]'}`}
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <b
          className={
            featured
              ? 'font-display text-ep-navy text-[44px] font-extrabold leading-none tracking-[-0.025em]'
              : 'font-display text-ep-navy text-2xl font-extrabold leading-[1.05] tracking-[-0.015em]'
          }
        >
          {stat}
        </b>
        <span
          className={`text-ep-muted whitespace-pre-line font-sans font-semibold ${featured ? 'text-[15px] leading-[1.3]' : 'text-sm leading-[1.25]'}`}
        >
          {label}
        </span>
      </div>
    </header>
  );
}

function CardLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ep-blue hover:text-ep-blue600 inline-flex items-center gap-1.5 self-start break-all font-sans text-[13px] font-medium transition-all duration-150 hover:gap-2"
    >
      <span>{label}</span>
      <ExtLinkIcon />
    </a>
  );
}

export function Trust() {
  return (
    <section className="bg-ep-bg relative w-full overflow-hidden pb-[clamp(70px,8vw,110px)] pt-[clamp(80px,9vw,130px)]">
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="absolute bottom-14 left-[clamp(20px,4vw,60px)] origin-bottom-left scale-[0.7] opacity-70">
          <DotGrid />
        </div>
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-[1440px] items-start gap-[clamp(40px,5vw,88px)] px-[clamp(20px,4vw,80px)] min-[961px]:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <header className="flex flex-col items-start">
          <div className="mb-[22px]">
            <Eyebrow icon={<ShieldCheckIcon size={13} className="text-ep-blue" />}>
              Open source proof
            </Eyebrow>
          </div>
          <h2 className="font-display text-ep-navy m-0 mb-6 text-[clamp(34px,3.8vw,50px)] font-bold leading-[1.08] tracking-[-0.02em] [text-wrap:balance]">
            Built in <em className="ep-grad not-italic">the open</em>.
          </h2>
          <div
            className="from-ep-blue to-ep-purple mb-6 h-[7px] w-[60px] rounded-[10px] bg-gradient-to-r"
            aria-hidden
          />
          <p className="text-ep-muted m-0 mb-7 max-w-[360px] font-sans text-[17px] leading-[1.55]">
            EmbedPDF is backed by real developer adoption: npm downloads, GitHub stars, and active
            participation in the PDF ecosystem.
          </p>
          <div className="mb-9 flex flex-wrap items-center gap-5">
            <EpButton href="/docs" variant="primary" icon="arrow">
              Get Started
            </EpButton>
            <Link
              href="/docs"
              className="font-display text-ep-blue hover:text-ep-blue700 inline-flex items-center gap-1.5 text-[15px] font-semibold transition-all duration-200 hover:gap-2.5"
            >
              Read the docs
              <ArrowRightIcon size={14} strokeWidth={2.4} />
            </Link>
          </div>
        </header>

        <div className="grid gap-[18px] min-[561px]:grid-cols-2">
          {/* Featured npm card with sparkline */}
          <article
            className={`${CARD_BASE} col-span-full grid items-stretch gap-x-8 gap-y-[18px] !p-[28px_28px_24px] min-[761px]:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]`}
            style={{
              background:
                'radial-gradient(circle at 100% 0%, rgba(151,71,255,0.06) 0%, transparent 55%), radial-gradient(circle at 0% 100%, rgba(8,118,253,0.06) 0%, transparent 55%), linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)',
            }}
          >
            <div className="flex min-w-0 flex-col gap-4">
              <CardHead
                featured
                iconBg="#FCEDED"
                icon={<NpmMark size={52} />}
                stat="1M+"
                label="monthly downloads on npm"
              />
              <p className="text-ep-muted m-0 flex-1 font-sans text-[15px] leading-[1.55]">
                Trusted by developers worldwide to embed PDFs at scale — from indie tools to
                enterprise document platforms.
              </p>
              <div className="mt-auto">
                <CardLink
                  href="https://www.npmjs.com/package/@embedpdf/snippet"
                  label="npmjs.com"
                />
              </div>
            </div>
            <div
              aria-hidden
              className="relative flex min-h-[200px] flex-col gap-2 overflow-hidden rounded-[14px] border border-[#E9EEFF] bg-gradient-to-b from-[#FAFBFF] via-white to-[#FDF8FF] px-4 pb-3 pt-4 max-[760px]:min-h-[170px]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-ep-subtle text-[10px] font-bold uppercase tracking-[0.1em]">
                  Monthly downloads · last 18 months
                </span>
                <span className="font-display text-ep-blue inline-flex items-center gap-1 rounded-full border border-[rgba(8,118,253,0.18)] bg-[rgba(8,118,253,0.08)] px-[9px] py-1 text-[11px] font-bold">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M5 19 19 5M9 5h10v10"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Growing
                </span>
              </div>
              <SparkLine />
              <div className="text-ep-faint flex justify-between px-0.5 font-sans text-[10px] font-medium">
                <span>2023</span>
                <span>2024</span>
                <span>2025</span>
                <span>Now</span>
              </div>
            </div>
          </article>

          <article className={CARD_BASE}>
            <CardHead
              iconBg="#F2F3F5"
              icon={<GitHubIcon size={40} className="text-[#181717]" />}
              stat="4K+"
              label="GitHub stars"
            />
            <p className="text-ep-muted m-0 flex-1 font-sans text-sm leading-[1.55]">
              A growing community of developers building the future of PDF on the web.
            </p>
            <CardLink href="https://github.com/embedpdf/embed-pdf-viewer" label="github.com" />
          </article>

          <article className={CARD_BASE}>
            <CardHead
              iconBg="#FAF6EC"
              icon={
                <Image
                  src="/pdf-association.svg"
                  alt=""
                  width={38}
                  height={38}
                  className="block h-[38px] w-[38px]"
                />
              }
              stat="PDF"
              label={'Association\nmember'}
            />
            <p className="text-ep-muted m-0 flex-1 font-sans text-sm leading-[1.55]">
              Proud member of the PDF Association advancing the future of PDF.
            </p>
            <CardLink href="https://pdfa.org" label="pdfa.org" />
          </article>
        </div>
      </div>
    </section>
  );
}
