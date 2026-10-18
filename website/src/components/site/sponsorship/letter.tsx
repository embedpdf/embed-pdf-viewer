import {
  HighlighterIcon,
  Note01Icon,
  SignatureIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Allura, Caveat } from 'next/font/google';
import Image from 'next/image';
import type { ReactNode } from 'react';

import { CheckIcon } from '../icons';
import { FOUNDING_SEATS } from './data';
import { SectionHead } from './parts';

// The two handwriting faces @embedpdf/default-signature-fonts ships for typed
// signatures — the letter is signed the way the viewer would sign it.
const allura = Allura({ subsets: ['latin'], weight: '400', display: 'swap' });
const caveat = Caveat({ subsets: ['latin'], weight: ['600'], display: 'swap' });

const LEGEND: { icon: typeof HighlighterIcon; label: string; swatch: ReactNode }[] = [
  {
    icon: TextStrikethroughIcon,
    label: 'Strikeout',
    swatch: <span className="h-[3px] w-5 rounded bg-[#E5484D]" />,
  },
  {
    icon: HighlighterIcon,
    label: 'Highlight',
    swatch: <span className="h-3 w-5 rounded-[3px] bg-[#FFE16A]" />,
  },
  {
    icon: TextUnderlineIcon,
    label: 'Underline',
    swatch: <span className="bg-ep-blue h-[3px] w-5 rounded" />,
  },
  {
    icon: Note01Icon,
    label: 'Note',
    swatch: <span className="h-3 w-3 rounded-[3px] bg-[#FFC94A]" />,
  },
  {
    icon: SignatureIcon,
    label: 'Signature',
    swatch: <span className={`${allura.className} text-ep-navy text-[18px] leading-none`}>B</span>,
  },
];

export function FounderLetter() {
  return (
    <section className="relative w-full overflow-hidden bg-white py-[clamp(70px,9vw,130px)]">
      <div className="relative z-[1] mx-auto grid w-full max-w-[1440px] items-start gap-[clamp(40px,5vw,88px)] px-[clamp(20px,4vw,80px)] min-[1101px]:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <div className="flex flex-col items-start min-[1101px]:sticky min-[1101px]:top-[120px]">
          <SectionHead
            align="left"
            eyebrow="Why this exists"
            icon={
              <HugeiconsIcon icon={Note01Icon} size={14} strokeWidth={2} className="text-ep-blue" />
            }
            title={
              <>
                A letter from <em className="ep-grad not-italic">the founder</em>
              </>
            }
            lede="EmbedPDF started as a refusal to rent a black box. The story is short — and every mark on it is drawn with an annotation the viewer ships."
          />
          <ul className="m-0 mt-8 grid w-full list-none grid-cols-2 gap-2 p-0 min-[1101px]:grid-cols-1">
            {LEGEND.map((l) => (
              <li
                key={l.label}
                className="border-ep-border text-ep-navy flex items-center gap-3 rounded-xl border bg-[#FBFCFE] px-3.5 py-2.5 font-sans text-sm font-semibold"
              >
                <HugeiconsIcon icon={l.icon} size={18} strokeWidth={1.8} className="text-ep-soft" />
                <span className="flex-1">{l.label}</span>
                <span className="inline-flex w-5 items-center justify-center">{l.swatch}</span>
              </li>
            ))}
          </ul>
        </div>

        <ViewerFrame>
          <LetterPage />
        </ViewerFrame>
      </div>
    </section>
  );
}

/** A trimmed-down EmbedPDF viewer: file name, annotation tools, page count. */
function ViewerFrame({ children }: { children: ReactNode }) {
  const tools = [
    TextStrikethroughIcon,
    HighlighterIcon,
    TextUnderlineIcon,
    Note01Icon,
    SignatureIcon,
  ];
  return (
    <div className="border-ep-border overflow-hidden rounded-[20px] border bg-[#EDF1F7] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_6px_rgba(7,32,76,0.05),0_40px_80px_-40px_rgba(7,32,76,0.35)]">
      <div
        aria-hidden
        className="border-ep-border flex h-[52px] items-center gap-3 border-b bg-white px-3.5"
      >
        <Image src="/embedpdf-icon.svg" alt="" width={16} height={20} className="h-5 w-auto" />
        <span className="text-ep-navy min-w-0 truncate font-sans text-[13px] font-semibold">
          letter-from-the-founder.pdf
        </span>
        <div className="mx-auto hidden items-center gap-0.5 rounded-[10px] border border-[#E9EEFF] bg-[#F6F8FC] p-[3px] min-[641px]:flex">
          {tools.map((icon, i) => (
            <span
              key={i}
              className={`inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px] ${
                i === 1
                  ? 'text-ep-blue bg-white shadow-[0_1px_3px_rgba(7,32,76,0.12)]'
                  : 'text-ep-subtle'
              }`}
            >
              <HugeiconsIcon icon={icon} size={16} strokeWidth={1.8} />
            </span>
          ))}
        </div>
        <span className="text-ep-subtle ml-auto inline-flex items-center gap-2 font-sans text-xs font-semibold min-[641px]:ml-0">
          <span className="rounded-md border border-[#E9EEFF] px-2 py-1">1 / 1</span>
          <span className="rounded-md border border-[#E9EEFF] px-2 py-1">100%</span>
        </span>
      </div>
      <div className="flex justify-center px-[clamp(10px,3vw,44px)] py-[clamp(14px,3vw,44px)]">
        {children}
      </div>
    </div>
  );
}

/** Strikeout: the PDF kind — a red rule through the run, text left legible. */
function Strike({ children }: { children: ReactNode }) {
  return (
    <span className="relative whitespace-nowrap">
      {children}
      <span
        aria-hidden
        className="absolute left-[-3px] right-[-3px] top-[54%] h-[0.09em] min-h-[3px] -rotate-[1.5deg] rounded-full bg-[#E5484D]"
      />
    </span>
  );
}

/** Highlight, drawn selected — the frame and handles the viewer puts on it. */
function Highlight({ children }: { children: ReactNode }) {
  const handle = 'absolute h-[7px] w-[7px] rounded-[2px] border-[1.5px] border-ep-blue bg-white';
  return (
    <span className="relative inline-block whitespace-nowrap">
      <mark className="rounded-[2px] bg-[#FFE16A] px-[3px] text-inherit [mix-blend-mode:multiply]">
        {children}
      </mark>
      <span
        aria-hidden
        className="border-ep-blue pointer-events-none absolute -inset-x-[3px] -inset-y-[2px] border"
      >
        <span className={`${handle} -left-1 -top-1`} />
        <span className={`${handle} -right-1 -top-1`} />
        <span className={`${handle} -bottom-1 -left-1`} />
        <span className={`${handle} -bottom-1 -right-1`} />
      </span>
    </span>
  );
}

function Underline({ children }: { children: ReactNode }) {
  return (
    <span className="decoration-ep-blue underline decoration-[2.5px] underline-offset-[5px] [text-decoration-skip-ink:none]">
      {children}
    </span>
  );
}

function LetterPage() {
  return (
    <article className="relative w-full max-w-[700px] bg-white px-[clamp(22px,5.5vw,68px)] pb-[clamp(30px,5vw,60px)] pt-[clamp(30px,5vw,64px)] shadow-[0_1px_2px_rgba(7,32,76,0.08),0_18px_40px_-22px_rgba(7,32,76,0.3)]">
      <header className="mb-[clamp(22px,3vw,34px)] flex items-center justify-between gap-4 border-b border-[#EEF2F8] pb-4">
        <span className="font-display text-ep-subtle text-[11px] font-bold uppercase tracking-[0.12em]">
          EmbedPDF · Sponsorship
        </span>
        <span className="text-ep-faint font-sans text-[11px] font-medium">Page 1</span>
      </header>

      {/* Broken by hand so the struck price owns its line, with the
          handwritten callout beside it at every width that fits one. */}
      <h3 className="font-display text-ep-navy m-0 text-[clamp(24px,3vw,34px)] font-extrabold leading-[1.22] tracking-[-0.015em]">
        I didn&apos;t want to pay
        <br />
        <Strike>$180,000 a year</Strike>
        <span
          aria-hidden
          className={`${caveat.className} ml-3 inline-block -translate-y-1 rotate-[-4deg] align-middle text-[clamp(20px,2vw,24px)] font-semibold leading-none tracking-normal text-[#E5484D] max-[479px]:hidden`}
        >
          ← yes, per year.
        </span>
        <br />
        for a PDF SDK. <span className="ep-grad">So I built my own.</span>
      </h3>

      <div className="text-ep-ink mt-[clamp(18px,2.6vw,28px)] flex flex-col gap-[1.05em] font-sans text-[clamp(15px,1.25vw,16.5px)] leading-[1.75]">
        <p className="m-0">
          When I needed a PDF SDK for my own product, every quote looked the same: tens of thousands
          of dollars a year, on terms the vendor could change whenever they liked.
        </p>
        <p className="m-0">
          And the price wasn&apos;t even the worst part. Every option was a{' '}
          <Highlight>black box</Highlight> — closed source you can&apos;t inspect, fix or truly own.
          Your product ends up resting on code you&apos;re not allowed to read.
        </p>
        <p className="m-0">
          So I started building <Underline>an open-source alternative</Underline>. No vendor
          lock-in. No black boxes. Just great PDF technology developers can trust — Apache-2.0, for
          everyone, forever.
        </p>
        <p className="m-0">
          Sponsorship is how it stays that way. It turns nights and weekends into full-time
          engineering, and it lets the companies that depend on EmbedPDF steer where it goes next.
        </p>
      </div>

      <footer className="mt-[clamp(26px,4vw,40px)] flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-ep-muted m-0 mb-2 font-sans text-[15px]">Thank you for reading,</p>
          <div className="relative rounded-md border border-dashed border-[rgba(8,118,253,0.45)] bg-[rgba(8,118,253,0.035)] py-1 pl-5 pr-12">
            <span className={`${allura.className} text-ep-navy block text-[44px] leading-[1.15]`}>
              Bob Singor
            </span>
            <span className="font-display absolute -top-2.5 left-3 bg-white px-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#5E8FD6]">
              Signature
            </span>
            <span
              aria-label="Signed"
              className="absolute right-2.5 top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(34,197,94,0.12)] text-[#15803D]"
            >
              <CheckIcon size={12} strokeWidth={3} />
            </span>
          </div>
          <p className="text-ep-navy m-0 mt-2.5 font-sans text-sm font-bold">
            Bob Singor <span className="text-ep-subtle font-medium">· Founder, EmbedPDF</span>
          </p>
        </div>
        <StickyNote />
      </footer>
    </article>
  );
}

/** A sticky-note annotation with its popup open. */
function StickyNote() {
  return (
    <aside className="flex max-w-[270px] rotate-[1.5deg] items-start gap-2.5">
      <span
        aria-hidden
        className="relative inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[6px] bg-[#FFC94A] text-[#7A5200] shadow-[0_2px_6px_rgba(122,82,0,0.3)]"
      >
        <HugeiconsIcon icon={Note01Icon} size={16} strokeWidth={2} />
      </span>
      <span className="block rounded-xl border border-[#F3DFA6] bg-[#FFFBEA] px-3.5 py-3 font-sans text-[13px] leading-[1.5] text-[#5C4A12] shadow-[0_10px_24px_-12px_rgba(122,82,0,0.35)]">
        <b className="font-display mb-0.5 block text-xs font-bold text-[#7A5200]">Bob Singor</b>
        The first {FOUNDING_SEATS} companies to sponsor for a year are recognized as founding
        sponsors — permanently.
      </span>
    </aside>
  );
}
