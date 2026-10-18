import { CheckmarkBadge01Icon, SquareUnlock01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  AngularIcon,
  ArrowRightIcon,
  DownloadIcon,
  GitHubIcon,
  JsMark,
  ReactIcon,
  SvelteIcon,
  VueIcon,
} from '../icons';
import { SectionHead } from './parts';

const CARD =
  'relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-ep-border bg-white p-6 ' +
  'shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_1px_2px_rgba(7,32,76,0.04),0_12px_32px_-18px_rgba(7,32,76,0.10)] ' +
  'transition-all duration-200 hover:-translate-y-[3px] hover:border-[rgba(8,118,253,0.30)] ' +
  'hover:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_4px_rgba(7,32,76,0.06),0_22px_44px_-18px_rgba(8,118,253,0.22)]';

const FRAMEWORKS: { label: string; icon: ReactNode }[] = [
  { label: 'Vanilla JS', icon: <JsMark /> },
  { label: 'React', icon: <ReactIcon /> },
  { label: 'Vue', icon: <VueIcon /> },
  { label: 'Svelte', icon: <SvelteIcon /> },
  { label: 'Angular', icon: <AngularIcon /> },
];

const FEATURES = [
  'Annotations',
  'Forms',
  'Signatures',
  'Redaction',
  'Search',
  'Stamps',
  'Thumbnails',
  'Printing',
];

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <b className="font-display text-ep-navy text-[40px] font-extrabold leading-none tracking-[-0.025em]">
        {value}
      </b>
      <span className="text-ep-muted font-sans text-sm font-semibold">{label}</span>
    </div>
  );
}

function IconTile({ bg, children }: { bg: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[14px]"
      style={{ background: bg }}
    >
      {children}
    </span>
  );
}

export function AlreadyShipped() {
  return (
    <section className="bg-ep-bg relative w-full py-[clamp(70px,9vw,130px)]">
      <div className="mx-auto grid w-full max-w-[1440px] items-start gap-[clamp(40px,5vw,88px)] px-[clamp(20px,4vw,80px)] min-[1101px]:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <div className="flex flex-col items-start">
          <SectionHead
            align="left"
            eyebrow="Already shipped"
            icon={
              <HugeiconsIcon
                icon={CheckmarkBadge01Icon}
                size={14}
                strokeWidth={2}
                className="text-ep-blue"
              />
            }
            title={
              <>
                Not a pitch deck. <em className="ep-grad not-italic">A product.</em>
              </>
            }
            lede="Sponsorship isn't a bet on slides. EmbedPDF v3 runs in production today — this is what your support builds on."
          />
          <Link
            href="/demo"
            className="font-display text-ep-blue hover:text-ep-blue700 mt-7 inline-flex items-center gap-1.5 text-[15px] font-semibold transition-all duration-200 hover:gap-2.5"
          >
            Try the live demo
            <ArrowRightIcon size={14} strokeWidth={2.4} />
          </Link>
        </div>

        <div className="grid gap-[18px] min-[721px]:grid-cols-3">
          <article
            className={`${CARD} min-[721px]:col-span-2`}
            style={{
              background:
                'radial-gradient(circle at 100% 0%, rgba(151,71,255,0.07) 0%, transparent 50%), radial-gradient(circle at 0% 100%, rgba(8,118,253,0.07) 0%, transparent 55%), #fff',
            }}
          >
            <span className="font-display text-ep-subtle text-[11px] font-bold uppercase tracking-[0.1em]">
              Viewer + headless components
            </span>
            <h3 className="font-display text-ep-navy m-0 text-[clamp(22px,2vw,26px)] font-extrabold leading-[1.2] tracking-[-0.01em]">
              One engine, every framework
            </h3>
            <p className="text-ep-muted m-0 max-w-[46ch] font-sans text-[15px] leading-[1.55]">
              A drop-in viewer for instant results, or headless building blocks for a UI that is
              entirely yours.
            </p>
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              {FRAMEWORKS.map((f) => (
                <span
                  key={f.label}
                  className="font-display text-ep-navy inline-flex items-center gap-2 rounded-[10px] border border-[rgba(7,32,76,0.10)] bg-white py-2 pl-2.5 pr-3.5 text-[13px] font-semibold shadow-[0_1px_2px_rgba(7,32,76,0.06)]"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center">{f.icon}</span>
                  {f.label}
                </span>
              ))}
            </div>
          </article>

          <article className={CARD}>
            <IconTile bg="#F2F3F5">
              <GitHubIcon size={26} className="text-[#181717]" />
            </IconTile>
            <Stat value="4K+" label="GitHub stars" />
            <p className="text-ep-muted m-0 font-sans text-sm leading-[1.55]">
              Developers watching, starring and shipping with it.
            </p>
          </article>

          <article className={CARD}>
            <IconTile bg="#FFF4EC">
              <Image src="/pdfium.svg" alt="" width={28} height={31} className="h-[30px] w-auto" />
            </IconTile>
            <h3 className="font-display text-ep-navy m-0 text-lg font-extrabold leading-[1.25]">
              Our own PDFium fork
            </h3>
            <p className="text-ep-muted m-0 font-sans text-sm leading-[1.55]">
              EmbedPDF Runtime: Google&apos;s PDF engine, maintained by us and compiled to
              WebAssembly.
            </p>
          </article>

          <article className={CARD}>
            <IconTile bg="#ECF3FE">
              <DownloadIcon size={24} className="text-ep-blue" />
            </IconTile>
            <Stat value="1M+" label="monthly npm downloads" />
            <p className="text-ep-muted m-0 font-sans text-sm leading-[1.55]">
              From indie tools to enterprise document platforms.
            </p>
          </article>

          <article className={CARD}>
            <IconTile bg="#EAF8EF">
              <HugeiconsIcon
                icon={SquareUnlock01Icon}
                size={24}
                strokeWidth={2}
                className="text-[#16A34A]"
              />
            </IconTile>
            <h3 className="font-display text-ep-navy m-0 text-lg font-extrabold leading-[1.25]">
              Apache-2.0, forever
            </h3>
            <p className="text-ep-muted m-0 font-sans text-sm leading-[1.55]">
              Read it, fork it, ship it. A licence no vendor can take back.
            </p>
          </article>

          <article className={`${CARD} min-[721px]:col-span-2`}>
            <h3 className="font-display text-ep-navy m-0 text-lg font-extrabold leading-[1.25]">
              Real PDF work, not a toy viewer
            </h3>
            <div className="flex flex-wrap gap-2">
              {FEATURES.map((f) => (
                <span
                  key={f}
                  className="text-ep-blue700 inline-flex items-center rounded-full border border-[#BFD8FB] bg-[#ECF3FE] px-3 py-1.5 font-sans text-[13px] font-semibold"
                >
                  {f}
                </span>
              ))}
            </div>
          </article>

          <article className={CARD}>
            <IconTile bg="#FAF6EC">
              <Image
                src="/pdf-association.svg"
                alt=""
                width={30}
                height={30}
                className="h-[30px] w-[30px]"
              />
            </IconTile>
            <h3 className="font-display text-ep-navy m-0 text-lg font-extrabold leading-[1.25]">
              PDF Association member
            </h3>
            <p className="text-ep-muted m-0 font-sans text-sm leading-[1.55]">
              Advancing the future of PDF with the industry.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
