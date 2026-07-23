import { StarIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import { DotGrid } from './dot-grid';
import { ArrowRightIcon } from './icons';

type Testimonial = {
  step: string;
  title: string;
  date: string;
  quote: string;
  name: string;
  role: string;
  company: string;
  companyHref: string;
  avatar: string;
  accent: string;
  badge: 'page' | 'node' | 'spark';
};

const TESTIMONIALS: Testimonial[] = [
  {
    step: '01',
    title: 'Getting started',
    date: 'March 2024',
    quote:
      'Integrating EmbedPDF took us less than a day. The docs are fantastic and the API is super easy to work with.',
    name: 'Jason Miller',
    role: 'Senior Frontend Engineer',
    company: 'Acme Inc.',
    companyHref: '#',
    avatar: '/avatar-jason.png',
    accent: '#0876FD',
    badge: 'page',
  },
  {
    step: '02',
    title: 'Scaling with confidence',
    date: 'May 2024',
    quote:
      'We scaled to millions of document views without worrying about performance. EmbedPDF just works.',
    name: 'Sarah Chen',
    role: 'Engineering Lead',
    company: 'DataFlow',
    companyHref: '#',
    avatar: '/avatar-sarah.png',
    accent: '#9747FF',
    badge: 'node',
  },
  {
    step: '03',
    title: 'Building better products',
    date: 'July 2024',
    quote:
      'Our users love the fast, native-like experience. EmbedPDF helps us deliver a premium product every time.',
    name: 'David Ramirez',
    role: 'CTO',
    company: 'Papertrail',
    companyHref: '#',
    avatar: '/avatar-david.png',
    accent: '#10B981',
    badge: 'spark',
  },
];

function BigQuoteMark({ color }: { color: string }) {
  return (
    <svg
      width="34"
      height="28"
      viewBox="0 0 34 28"
      fill="none"
      aria-hidden
      className="-mb-1 flex-shrink-0"
    >
      <path
        d="M8.4 2C4.2 2 1 6.7 1 13c0 5 2.6 7.8 5.8 7.8 2.6 0 4.7-2.5 4.7-5.6 0-3.1-1.8-5.3-4.2-5.3-.5 0-1 .15-1.4.3.25-3.1 2.45-5.6 5.05-6.2L8.4 2Zm12 0C16.2 2 13 6.7 13 13c0 5 2.6 7.8 5.8 7.8 2.6 0 4.7-2.5 4.7-5.6 0-3.1-1.8-5.3-4.2-5.3-.5 0-1 .15-1.4.3.25-3.1 2.45-5.6 5.05-6.2L20.4 2Z"
        fill={color}
      />
    </svg>
  );
}

function BadgeIcon({ kind, color }: { kind: Testimonial['badge']; color: string }) {
  if (kind === 'page') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M14 3v5h5" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'node') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.5" fill={color} />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="m12 3 2.2 6 6 2.2-6 2.2L12 19.4 9.8 13.4l-6-2.2 6-2.2L12 3Z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TimelineItem({ data }: { data: Testimonial }) {
  return (
    <div
      className="grid items-stretch gap-4 max-[600px]:grid-cols-[22px_1fr] max-[600px]:gap-3.5 min-[601px]:grid-cols-[180px_28px_1fr] max-[820px]:min-[601px]:grid-cols-[120px_24px_1fr]"
      style={{ '--accent': data.accent } as CSSProperties}
    >
      <div className="flex flex-col pt-1.5 max-[600px]:col-start-2 max-[600px]:row-start-1 max-[600px]:-mb-2 max-[600px]:flex-row max-[600px]:items-baseline max-[600px]:gap-3 max-[600px]:pt-0">
        <div className="font-display mb-[18px] text-[28px] font-bold leading-none tracking-[-0.01em] text-[var(--accent)] max-[820px]:mb-3 max-[820px]:text-[22px] max-[600px]:m-0 max-[600px]:text-xl">
          {data.step}
        </div>
        <div className="text-ep-navy mb-3.5 font-sans text-[15px] font-bold leading-[1.3] max-[600px]:m-0">
          {data.title}
        </div>
        <div className="font-sans text-[13px] font-medium tracking-[0.01em] text-[#8590AA] max-[600px]:ml-auto">
          {data.date}
        </div>
      </div>

      <div
        className="relative flex w-7 flex-col items-center max-[600px]:col-start-1 max-[600px]:row-span-2 max-[600px]:row-start-1"
        aria-hidden
      >
        <div className="relative z-[2] mt-[30px] h-[18px] w-[18px] rounded-full border border-[#CFD8E8] bg-white after:absolute after:inset-[5px] after:rounded-full after:bg-[var(--accent)] after:content-['']" />
      </div>

      <article className="group relative rounded-[20px] bg-white p-[28px_32px] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_1px_2px_rgba(14,26,64,0.04),0_12px_36px_-16px_rgba(14,26,64,0.10)] transition-all duration-[250ms] hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_4px_rgba(14,26,64,0.06),0_22px_48px_-18px_rgba(14,26,64,0.16)] max-[820px]:p-[22px] max-[600px]:col-start-2 max-[600px]:row-start-2">
        <div
          aria-hidden
          className="absolute left-[-11px] top-6 z-0 h-[30px] w-3.5 bg-white [clip-path:polygon(100%_0,100%_100%,0_50%)] [filter:drop-shadow(-1px_0_0_rgba(14,26,64,0.04))]"
        />
        <div className="relative z-[1] grid items-start gap-7 max-[820px]:gap-[18px] min-[601px]:grid-cols-[116px_1fr] max-[820px]:min-[601px]:grid-cols-[88px_1fr]">
          <div className="relative h-[116px] w-[116px] max-[820px]:h-[88px] max-[820px]:w-[88px] max-[600px]:h-[72px] max-[600px]:w-[72px]">
            <Image
              src={data.avatar}
              alt={data.name}
              width={116}
              height={116}
              className="block h-full w-full rounded-full bg-[#EEF2F8] object-cover"
            />
            <div
              className="absolute bottom-0.5 right-0.5 inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-[3px] border-white shadow-[0_4px_10px_rgba(14,26,64,0.15)] max-[820px]:h-7 max-[820px]:w-7 max-[600px]:h-6 max-[600px]:w-6 max-[600px]:border-2"
              style={{ background: data.accent }}
            >
              <BadgeIcon kind={data.badge} color="#fff" />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3.5">
            <BigQuoteMark color={data.accent} />
            <p className="text-ep-ink m-0 max-w-[48ch] font-sans text-[17px] leading-[1.55] [text-wrap:pretty] max-[820px]:text-[15px]">
              {data.quote}
            </p>
            <div className="mt-1 flex flex-col gap-1">
              <b className="text-ep-navy font-sans text-[15px] font-bold leading-[1.3]">
                {data.name}
              </b>
              <span className="text-ep-subtle font-sans text-sm leading-[1.4]">
                {data.role} at{' '}
                <a href={data.companyHref} className="text-ep-blue font-semibold hover:underline">
                  {data.company}
                </a>
              </span>
            </div>
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
        >
          <svg
            width="120"
            height="100"
            viewBox="0 0 80 70"
            fill="none"
            className="absolute bottom-[-16px] right-[-40px] origin-bottom-right rotate-[-12deg] opacity-[0.16]"
            style={{ color: data.accent }}
          >
            <path
              d="M22 12c-11 0-20 13-20 30 0 13 7 21 14 21s12-6 12-14c0-8-5-14-11-14-1.3 0-2.5.3-3.5.7.9-8.3 7-14.5 13.5-16.5L22 12Zm32 0c-11 0-20 13-20 30 0 13 7 21 14 21s12-6 12-14c0-8-5-14-11-14-1.3 0-2.5.3-3.5.7.9-8.3 7-14.5 13.5-16.5L54 12Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </article>
    </div>
  );
}

export function Testimonials() {
  return (
    <section className="relative w-full overflow-hidden bg-[#F4F6FB] pb-[clamp(70px,9vw,130px)] pt-[clamp(80px,10vw,140px)]">
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="absolute left-[clamp(20px,6vw,90px)] top-[110px] origin-top-left scale-[0.85] opacity-70">
          <DotGrid />
        </div>
        <div className="absolute right-[clamp(20px,4vw,60px)] top-[56%] origin-top-right scale-[0.85] opacity-70">
          <DotGrid />
        </div>
        <div className="absolute bottom-[-60px] left-[-40px] h-[280px] w-[320px]">
          <div className="absolute bottom-[60px] left-[60px] h-[200px] w-[220px] rotate-[-12deg] rounded-[28px] bg-gradient-to-br from-[#C7DDFF] to-[#97C0FB] opacity-55" />
          <div className="absolute bottom-0 left-0 h-[220px] w-[240px] rotate-[-22deg] rounded-[28px] bg-gradient-to-br from-[#4E92F7] to-[#1F73E8] opacity-85" />
          <div className="absolute bottom-[-20px] left-[130px] h-[160px] w-[160px] rotate-[6deg] rounded-[28px] bg-gradient-to-br from-[#B6D2FF] to-[#84B3FA] opacity-55" />
        </div>
      </div>

      <div className="relative z-[1] mx-auto w-full max-w-[1180px] px-[clamp(20px,4vw,60px)]">
        <header className="mx-auto mb-[72px] flex max-w-[720px] flex-col items-center gap-[22px] text-center">
          <div className="font-display text-ep-blue700 inline-flex items-center gap-2 rounded-full border border-[#C7DEFF] bg-[#E8F0FE] py-2 pl-3 pr-4 text-xs font-bold uppercase tracking-[0.10em]">
            <HugeiconsIcon icon={StarIcon} size={14} strokeWidth={2} className="text-ep-blue" />
            <span>Developer stories</span>
          </div>
          <h2 className="font-display text-ep-navy m-0 text-[clamp(36px,4.6vw,56px)] font-extrabold leading-[1.1] tracking-[-0.02em]">
            Loved once it is
            <br />
            in the <em className="ep-grad not-italic">product</em>
          </h2>
          <div
            className="from-ep-blue to-ep-purple h-[7px] w-[60px] rounded-[10px] bg-gradient-to-r"
            aria-hidden
          />
          <p className="text-ep-muted m-0 max-w-[620px] font-sans text-[17px] leading-[1.55]">
            From quick embeds to custom document workflows, developers use EmbedPDF to ship faster
            and stay in control.
          </p>
        </header>

        <div className="relative mx-auto flex max-w-[980px] flex-col gap-9 before:absolute before:bottom-0 before:left-[calc(180px+16px+14px)] before:top-0 before:z-0 before:w-0.5 before:-translate-x-px before:bg-[#CFD8E8] before:content-[''] max-[820px]:before:left-[calc(120px+12px+12px)] max-[600px]:before:hidden">
          {TESTIMONIALS.map((t) => (
            <TimelineItem key={t.step} data={t} />
          ))}
        </div>

        <footer className="mt-14 flex items-center justify-center">
          <Link
            href="/community"
            className="group inline-flex items-center gap-4 rounded-full py-2 pl-1 pr-2 transition-all duration-200 hover:gap-[22px]"
          >
            <span className="text-ep-navy font-sans text-base font-medium">
              Read more stories from our community
            </span>
            <span className="border-ep-border text-ep-blue group-hover:border-ep-blue group-hover:bg-ep-blue inline-flex h-10 w-10 items-center justify-center rounded-full border bg-white shadow-[0_4px_10px_rgba(14,26,64,0.06)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-white">
              <ArrowRightIcon size={18} strokeWidth={2.5} />
            </span>
          </Link>
        </footer>
      </div>
    </section>
  );
}
