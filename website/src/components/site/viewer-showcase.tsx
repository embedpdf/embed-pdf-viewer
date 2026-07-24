import Link from 'next/link';

import { EpButton } from './button';
import { Eyebrow, PillDivider } from './eyebrow';
import { ArrowRightIcon, CheckIcon } from './icons';
import { ViewerFrame } from './viewer-frame';

const HIGHLIGHTS = ['Production-ready UI', 'Runs entirely in your browser', 'Apache-2.0'];

export function ViewerShowcase() {
  return (
    <section className="relative overflow-hidden bg-white py-[clamp(70px,9vw,130px)]">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[42%] h-[720px] w-[min(1120px,90vw)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(8,118,253,0.10)_0%,rgba(151,71,255,0.045)_42%,transparent_72%)] blur-2xl"
      />

      <div className="relative z-[1] mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,80px)]">
        <div className="mb-[clamp(36px,5vw,64px)] grid items-end gap-8 min-[901px]:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
          <div className="flex max-w-[760px] flex-col items-start">
            <div className="mb-5">
              <Eyebrow dot>Live viewer</Eyebrow>
            </div>
            <h2 className="font-display text-ep-navy m-0 mb-6 text-[clamp(36px,4.4vw,56px)] font-bold leading-[1.05] tracking-[-0.025em]">
              The full PDF experience, <em className="ep-grad not-italic">ready to explore</em>
            </h2>
            <PillDivider gradient />
          </div>

          <div className="flex flex-col items-start gap-6 min-[901px]:pb-1">
            <p className="text-ep-body m-0 max-w-[560px] font-sans text-[17px] leading-[1.6]">
              Search, navigate, zoom, annotate, fill forms, and more. This is the real EmbedPDF
              viewer—try it right here.
            </p>
            <div className="flex flex-wrap gap-3">
              <EpButton href="/demo" variant="primary" icon="play">
                Open full demo
              </EpButton>
              <Link
                href="/docs/viewer/react/getting-started"
                className="font-display text-ep-blue hover:text-ep-blue700 group inline-flex h-[50px] items-center gap-1.5 px-2 text-[15px] font-semibold transition-all duration-200 hover:gap-2.5"
              >
                Build with React
                <ArrowRightIcon size={15} strokeWidth={2.4} />
              </Link>
            </div>
          </div>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-5 rounded-[32px] border border-[rgba(8,118,253,0.08)] bg-[linear-gradient(135deg,rgba(8,118,253,0.055),rgba(151,71,255,0.035))]"
          />
          <div className="relative">
            <ViewerFrame />
          </div>
        </div>

        <ul className="mt-7 flex list-none flex-wrap justify-center gap-x-8 gap-y-3 p-0">
          {HIGHLIGHTS.map((highlight) => (
            <li
              key={highlight}
              className="text-ep-slate flex items-center gap-2 font-sans text-sm font-medium"
            >
              <span className="text-ep-blue inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(8,118,253,0.11)]">
                <CheckIcon size={11} />
              </span>
              {highlight}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
