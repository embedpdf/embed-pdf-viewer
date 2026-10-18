import {
  Calendar03Icon,
  Linkedin01Icon,
  Mail01Icon,
  NewTwitterIcon,
  RocketIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Eyebrow } from '../eyebrow';
import { ArrowRightIcon, DiscordIcon } from '../icons';
import { CONTACT, mailto } from './data';

const DARK_BTN =
  'font-display inline-flex h-[50px] items-center gap-2.5 whitespace-nowrap rounded-[10px] px-[22px] text-base font-bold transition-all duration-150 hover:-translate-y-px';

/**
 * The page's last word, on the Quick Start navy: the three ways to reach the
 * founder, with the founder's card beside them.
 */
export function SponsorContact({
  title,
  lede,
  primary,
}: {
  title: ReactNode;
  lede: string;
  /** Replaces "Email Bob" as the lead action; email then moves to second. */
  primary?: { href: string; label: string };
}) {
  const ghost = `${DARK_BTN} border border-white/20 bg-white/[0.06] text-white hover:border-white/35 hover:bg-white/[0.1]`;
  return (
    <section className="bg-ep-bg w-full px-[clamp(16px,3vw,40px)] pb-[clamp(60px,8vw,110px)] pt-[clamp(20px,3vw,40px)]">
      <div className="ep-qs-bg relative mx-auto w-full max-w-[1280px] overflow-hidden rounded-[28px] px-[clamp(22px,5vw,80px)] py-[clamp(48px,6vw,88px)] shadow-[0_40px_80px_-40px_rgba(5,10,24,0.6)]">
        <div className="ep-qs-glare" aria-hidden />
        <div
          aria-hidden
          className="pointer-events-none absolute left-[-140px] top-[-140px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(8,118,253,0.25)_0%,transparent_65%)] blur-[30px]"
        />

        <div className="relative z-[7] grid items-center gap-[clamp(36px,5vw,72px)] min-[961px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex flex-col items-start">
            <div className="mb-6">
              <Eyebrow
                tone="dark"
                icon={
                  <HugeiconsIcon
                    icon={RocketIcon}
                    size={14}
                    strokeWidth={2}
                    className="text-ep-blue"
                  />
                }
              >
                Let&apos;s talk
              </Eyebrow>
            </div>
            <h2 className="font-display m-0 mb-5 text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.08] tracking-[-0.02em] text-white [text-wrap:balance]">
              {title}
            </h2>
            <p className="text-ep-faint m-0 max-w-[520px] font-sans text-[17px] leading-[1.6]">
              {lede}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {primary ? (
                <Link
                  href={primary.href}
                  className={`${DARK_BTN} bg-ep-blue hover:bg-ep-blue600 text-white hover:shadow-[0_8px_24px_rgba(8,118,253,0.45)]`}
                >
                  {primary.label}
                  <ArrowRightIcon size={18} />
                </Link>
              ) : (
                <a
                  href={mailto('Sponsoring EmbedPDF')}
                  className={`${DARK_BTN} bg-ep-blue hover:bg-ep-blue600 text-white hover:shadow-[0_8px_24px_rgba(8,118,253,0.45)]`}
                >
                  <HugeiconsIcon icon={Mail01Icon} size={18} strokeWidth={2} />
                  Email Bob
                </a>
              )}
              <a href={CONTACT.call} target="_blank" rel="noopener noreferrer" className={ghost}>
                <HugeiconsIcon icon={Calendar03Icon} size={18} strokeWidth={2} />
                Book a 30-min call
              </a>
              {primary ? (
                <a href={mailto('Sponsoring EmbedPDF')} className={ghost}>
                  <HugeiconsIcon icon={Mail01Icon} size={18} strokeWidth={2} />
                  Email Bob
                </a>
              ) : (
                <a
                  href={CONTACT.discord}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ghost}
                >
                  <DiscordIcon size={18} />
                  Discord
                </a>
              )}
            </div>
          </div>

          <FounderCard />
        </div>
      </div>
    </section>
  );
}

function FounderCard() {
  const social =
    'inline-flex h-9 w-9 items-center justify-center rounded-[9px] border border-white/15 text-[#C7D3EE] transition-colors duration-150 hover:border-white/30 hover:bg-white/10 hover:text-white';
  return (
    <figure className="m-0 rounded-[22px] border border-white/[0.1] bg-white/[0.04] p-[clamp(22px,2.6vw,32px)] backdrop-blur-[6px]">
      <blockquote className="font-display m-0 text-[clamp(19px,1.7vw,22px)] font-bold leading-[1.45] text-white">
        “Let&apos;s build technology that nobody can take away.”
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3.5 border-t border-white/[0.08] pt-6">
        <span className="font-display from-ep-blue to-ep-purple inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-base font-extrabold text-white shadow-[0_0_0_3px_rgba(255,255,255,0.1)]">
          BS
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-bold text-white">Bob Singor</div>
          <div className="text-ep-faint font-sans text-[13px]">Founder, EmbedPDF</div>
        </div>
        <a
          href={CONTACT.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Bob Singor on LinkedIn"
          className={social}
        >
          <HugeiconsIcon icon={Linkedin01Icon} size={17} strokeWidth={2} />
        </a>
        <a
          href={CONTACT.x}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Bob Singor on X"
          className={social}
        >
          <HugeiconsIcon icon={NewTwitterIcon} size={17} strokeWidth={2} />
        </a>
      </figcaption>
    </figure>
  );
}
