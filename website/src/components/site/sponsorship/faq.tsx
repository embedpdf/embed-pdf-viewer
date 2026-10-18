import { HelpCircleIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CONTACT, FUNDING, usd } from './data';
import { SectionHead } from './parts';

const LINK = 'text-ep-blue font-semibold hover:text-ep-blue700 underline underline-offset-2';

const QUESTIONS: { q: string; a: ReactNode }[] = [
  {
    q: 'Why should we trust this will last?',
    a: (
      <>
        Look at the track record: 4K+ GitHub stars, more than a million npm downloads a month, and a
        v3 that ships a ready-made viewer and headless components for five frameworks on our own
        PDFium-based engine. Sponsorship is what turns that momentum into a full-time team.
      </>
    ),
  },
  {
    q: 'What happens if EmbedPDF gets acquired?',
    a: (
      <>
        The code is Apache-2.0 licensed, and that licence can&apos;t be taken back. Every release
        you&apos;ve used stays yours to run, fork and modify. That&apos;s the point of open source:
        no single company can take it away.
      </>
    ),
  },
  {
    q: `Why ${usd(FUNDING.goal)} a month?`,
    a: (
      <>
        Full transparency: it covers a lead developer ($15–18K a month) and a senior mobile
        developer ($12–15K a month). Two experienced engineers working full-time deliver what
        normally takes a team of five to ten at a big vendor. We&apos;re lean, focused and
        motivated.
      </>
    ),
  },
  {
    q: "What if we need features you haven't built yet?",
    a: (
      <>
        That&apos;s where active open source shines. Gold sponsors get custom feature development,
        Silver sponsors influence the roadmap, and because it&apos;s Apache-2.0 you can always have
        your own developers add what you need. Try that with a closed-source SDK.
      </>
    ),
  },
  {
    q: 'How do I justify this to my CFO?',
    a: (
      <>
        Simple ROI: if you&apos;re paying $150K+ a year for a PDF SDK, sponsoring at $30K a year
        saves $120K annually — and you lose the vendor risk, gain code ownership and can customize
        anything. I&apos;m happy to walk your finance team through the numbers on a call.
      </>
    ),
  },
  {
    q: 'Can we try it first?',
    a: (
      <>
        Absolutely. Open the{' '}
        <Link href="/demo" className={LINK}>
          live demo
        </Link>{' '}
        or{' '}
        <a
          href="https://github.com/embedpdf/embed-pdf-viewer"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          browse the code
        </a>
        . Use it, test it, deploy it to production — then decide whether to sponsor.
      </>
    ),
  },
];

export function SponsorFaq() {
  return (
    <section className="relative w-full bg-white py-[clamp(70px,9vw,130px)]">
      <div className="mx-auto grid w-full max-w-[1280px] items-start gap-[clamp(40px,5vw,88px)] px-[clamp(20px,4vw,80px)] min-[1025px]:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
        <div className="flex flex-col items-start min-[1025px]:sticky min-[1025px]:top-[120px]">
          <SectionHead
            align="left"
            eyebrow="FAQ"
            icon={
              <HugeiconsIcon
                icon={HelpCircleIcon}
                size={14}
                strokeWidth={2}
                className="text-ep-blue"
              />
            }
            title={
              <>
                Questions I&apos;m <em className="ep-grad not-italic">hearing</em>
              </>
            }
            lede={
              <>
                Something else on your mind?{' '}
                <a href={`mailto:${CONTACT.email}`} className={LINK}>
                  Email me
                </a>{' '}
                — I answer every message personally.
              </>
            }
          />
        </div>

        <div className="flex flex-col gap-3">
          {QUESTIONS.map((item, i) => (
            <details
              key={item.q}
              open={i === 0}
              className="border-ep-border group rounded-2xl border bg-white transition-all duration-200 open:border-[rgba(8,118,253,0.28)] open:bg-[#FBFCFF] open:shadow-[0_18px_40px_-26px_rgba(8,118,253,0.35)] hover:border-[rgba(8,118,253,0.28)]"
            >
              <summary className="font-display text-ep-navy flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 text-[17px] font-bold leading-[1.35] outline-none focus-visible:shadow-[0_0_0_2px_#0876FD] [&::-webkit-details-marker]:hidden">
                {item.q}
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
              <div className="text-ep-muted -mt-1 px-6 pb-6 font-sans text-[15.5px] leading-[1.65]">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
