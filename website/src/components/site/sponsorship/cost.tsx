import { BubbleChatIcon, Coins01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ReactNode } from 'react';

import { SectionHead } from './parts';

/** Annual licence ranges, in $K. The scale tops out just past the largest. */
const VENDORS = [
  { name: 'Apryse', min: 30, max: 700 },
  { name: 'Nutrient', min: 25, max: 400 },
  { name: 'ComPDF', min: 15, max: 100 },
];
const SCALE = 750;
const TICKS = [0, 250, 500, 750];

const VOICES = [
  {
    role: 'SaaS founder',
    tone: 'border-[rgba(255,107,129,0.35)] bg-[rgba(255,107,129,0.12)] text-[#FF9AAA]',
    quote:
      "We're on Nutrient and I'm terrified they'll double the price. We couldn't afford it, and our whole business depends on their software.",
  },
  {
    role: 'Early-stage startup',
    tone: 'border-[rgba(255,170,90,0.35)] bg-[rgba(255,170,90,0.12)] text-[#FFC48A]',
    quote:
      "They told us $25,000 a year is their minimum. That's our entire tools budget for the year.",
  },
  {
    role: 'Enterprise CTO',
    tone: 'border-[rgba(8,118,253,0.4)] bg-[rgba(8,118,253,0.16)] text-[#7BB2FF]',
    quote:
      "We need multi-platform support, and we'd much rather invest in open source than pay tens of thousands for a black box.",
  },
];

const k = (v: number) => (v === 0 ? '$0' : `$${v}K`);

export function CostOfABlackBox() {
  return (
    <section className="ep-qs-bg relative z-[2] w-full overflow-hidden py-[clamp(90px,10vw,150px)]">
      <div className="ep-qs-glare" aria-hidden />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-160px] top-[-120px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(8,118,253,0.22)_0%,transparent_65%)] blur-[40px]"
      />

      <div className="relative z-[7] mx-auto w-full max-w-[1080px] px-[clamp(20px,4vw,40px)]">
        <SectionHead
          tone="dark"
          eyebrow="The status quo"
          icon={
            <HugeiconsIcon icon={Coins01Icon} size={14} strokeWidth={2} className="text-ep-blue" />
          }
          title={
            <>
              The price of a <em className="ep-grad-blue not-italic">black box</em>
            </>
          }
          lede="What commercial PDF SDKs charge per year — before you've written a line of your own code, and with no right to read theirs."
        />

        <figure className="m-0 mt-12 rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-[clamp(18px,3vw,34px)] backdrop-blur-[4px]">
          <div className="grid grid-cols-[minmax(92px,150px)_minmax(0,1fr)] gap-x-[clamp(12px,2vw,28px)]">
            <span />
            <div
              aria-hidden
              className="relative mb-3 h-4 font-sans text-[11px] font-semibold text-[#5F7099]"
            >
              {TICKS.map((t, i) => (
                <span
                  key={t}
                  className={`absolute top-0 -translate-x-1/2 first:translate-x-0 last:-translate-x-full ${
                    i > 0 && i < TICKS.length - 1 ? 'max-[560px]:hidden' : ''
                  }`}
                  style={{ left: `${(t / SCALE) * 100}%` }}
                >
                  {k(t)}
                </span>
              ))}
            </div>

            {VENDORS.map((v) => (
              <Row key={v.name} label={v.name} sub={`${k(v.min)}–${k(v.max)} / yr`}>
                <span
                  className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#FF9F6B] to-[#FF4D6D] shadow-[0_0_24px_rgba(255,77,109,0.35)]"
                  style={{
                    left: `${(v.min / SCALE) * 100}%`,
                    width: `${((v.max - v.min) / SCALE) * 100}%`,
                  }}
                />
              </Row>
            ))}

            <Row label="EmbedPDF" sub="Apache-2.0" brand>
              <span className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-[3px] border-[#0B1530] bg-[#4AA3FF] shadow-[0_0_0_4px_rgba(74,163,255,0.25),0_0_24px_rgba(74,163,255,0.8)]" />
              <span className="font-display absolute left-7 top-1/2 -translate-y-1/2 whitespace-nowrap text-[13px] font-bold text-[#7BB2FF]">
                $0<span className="max-[560px]:hidden"> — and the code is yours</span>
              </span>
            </Row>
          </div>
          <figcaption className="mt-5 border-t border-white/[0.06] pt-4 font-sans text-xs text-[#5F7099]">
            Typical annual licence ranges for commercial web PDF SDKs.
          </figcaption>
        </figure>

        <div className="mt-[clamp(56px,7vw,88px)]">
          <h3 className="font-display m-0 mb-6 flex flex-col items-center justify-center gap-2.5 text-center text-[clamp(20px,2vw,24px)] font-extrabold tracking-[-0.01em] text-white min-[561px]:flex-row">
            <HugeiconsIcon
              icon={BubbleChatIcon}
              size={22}
              strokeWidth={2}
              className="text-[#7BB2FF]"
            />
            Conversations we have every week
          </h3>
          <div className="grid gap-4 min-[861px]:grid-cols-3">
            {VOICES.map((v) => (
              <blockquote
                key={v.role}
                className="m-0 flex flex-col gap-4 rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-6"
              >
                <span
                  className={`font-display self-start rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${v.tone}`}
                >
                  {v.role}
                </span>
                <p className="m-0 font-sans text-[16px] leading-[1.6] text-[#DCE5F7]">
                  “{v.quote}”
                </p>
              </blockquote>
            ))}
          </div>
          <p className="font-display mx-auto mb-0 mt-10 max-w-[640px] text-center text-[clamp(18px,1.8vw,22px)] font-bold leading-[1.45] text-white [text-wrap:balance]">
            Every story is the same: trapped by expensive, closed-source vendors.{' '}
            <span className="text-ep-faint font-semibold">
              It&apos;s time for an alternative companies can actually own.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

function Row({
  label,
  sub,
  brand = false,
  children,
}: {
  label: string;
  sub: string;
  brand?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className={`flex flex-col justify-center py-3.5 ${brand ? 'border-t border-white/[0.08] pt-5' : ''}`}
      >
        <span
          className={`font-display text-[15px] font-extrabold ${brand ? 'text-[#7BB2FF]' : 'text-white'}`}
        >
          {label}
        </span>
        <span className="font-sans text-xs text-[#6B7B9D]">{sub}</span>
      </div>
      <div
        className={`relative bg-[linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:33.333%_100%] ${
          brand ? 'mt-0 border-t border-white/[0.08] pt-2' : ''
        }`}
      >
        {children}
      </div>
    </>
  );
}
