import { FavouriteIcon, Medal01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';

import { DotGrid } from '../dot-grid';
import { ArrowRightIcon, GitHubIcon } from '../icons';
import { CONTACT, FOUNDING_SEATS, SPONSORS, TIERS, mailto, type Tier } from './data';
import { CheckDot, SectionHead, SponsorLogo, TIER_TONE, TierMedal } from './parts';

function TierCard({ tier }: { tier: Tier }) {
  const tone = TIER_TONE[tier.id];
  const featured = !!tier.featured;
  return (
    <article
      className={`relative flex flex-col rounded-3xl bg-white p-[clamp(24px,2.4vw,32px)] transition-all duration-200 ${
        featured
          ? 'border-ep-blue border-2 shadow-[0_0_0_6px_rgba(8,118,253,0.08),0_30px_60px_-28px_rgba(8,118,253,0.45)] min-[961px]:-my-4 min-[961px]:py-[calc(clamp(24px,2.4vw,32px)_+_16px)]'
          : 'border-ep-border border shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_1px_2px_rgba(7,32,76,0.04),0_14px_36px_-20px_rgba(7,32,76,0.14)] hover:-translate-y-1 hover:border-[rgba(8,118,253,0.30)] hover:shadow-[0_2px_4px_rgba(7,32,76,0.06),0_24px_48px_-22px_rgba(8,118,253,0.25)]'
      }`}
    >
      {featured && (
        <span className="font-display from-ep-blue to-ep-purple absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-gradient-to-r px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white shadow-[0_6px_16px_-4px_rgba(8,118,253,0.5)]">
          Sweet spot
        </span>
      )}
      <div className="flex items-center gap-3.5">
        <TierMedal tier={tier.id} size={44} />
        <div>
          <h3 className="font-display text-ep-navy m-0 text-[22px] font-extrabold leading-[1.15] tracking-[-0.01em]">
            {tier.name}
          </h3>
          <p className="text-ep-subtle m-0 font-sans text-sm">{tier.tagline}</p>
        </div>
      </div>

      <div className="mt-6 flex items-baseline gap-1.5">
        <b className="font-display text-ep-navy text-[clamp(34px,3vw,42px)] font-extrabold leading-none tracking-[-0.03em]">
          {tier.price}
        </b>
        <span className="text-ep-subtle font-sans text-[15px] font-semibold">/ month</span>
      </div>

      <ul className="m-0 mb-8 mt-6 flex list-none flex-col gap-3 border-t border-[rgba(7,32,76,0.07)] p-0 pt-6">
        {tier.perks.map((perk, i) => (
          <li
            key={perk}
            className={`flex items-start gap-3 font-sans text-[15px] leading-[1.45] ${
              i === 0 && perk.startsWith('Everything') ? 'text-ep-subtle' : 'text-ep-ink'
            }`}
          >
            <CheckDot color={featured ? '#0876FD' : tone.check} />
            {perk}
          </li>
        ))}
      </ul>

      <a
        href={mailto(`${tier.name} sponsorship`)}
        className={`font-display mt-auto inline-flex h-[50px] items-center justify-center gap-2 rounded-[10px] px-5 text-[15px] font-bold transition-all duration-150 hover:-translate-y-px ${
          featured
            ? 'bg-ep-blue hover:bg-ep-blue600 text-white hover:shadow-[0_8px_20px_rgba(8,118,253,0.28)]'
            : 'border-ep-blue text-ep-blue hover:border-ep-blue600 hover:text-ep-blue600 border-2 hover:bg-[rgba(8,118,253,0.08)]'
        }`}
      >
        {tier.cta}
        <ArrowRightIcon size={18} />
      </a>
    </article>
  );
}

export function SponsorTiers() {
  return (
    <section
      id="tiers"
      className="bg-ep-bg relative w-full scroll-mt-[84px] overflow-hidden py-[clamp(70px,9vw,130px)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-[clamp(20px,4vw,60px)] top-[90px] origin-top-right scale-[0.8] opacity-70"
      >
        <DotGrid />
      </div>

      <div className="relative z-[1] mx-auto w-full max-w-[1200px] px-[clamp(20px,4vw,40px)]">
        <SectionHead
          eyebrow="Sponsor tiers"
          icon={
            <HugeiconsIcon icon={Medal01Icon} size={14} strokeWidth={2} className="text-ep-blue" />
          }
          title={
            <>
              Become a <em className="ep-grad not-italic">founding sponsor</em>
            </>
          }
          lede={`The first ${FOUNDING_SEATS} companies to commit to a tier for a year are recognized permanently as the founding sponsors who made EmbedPDF possible.`}
        />

        <div className="mt-16 grid items-stretch gap-6 min-[961px]:grid-cols-3 min-[961px]:gap-5">
          {TIERS.map((t) => (
            <TierCard key={t.id} tier={t} />
          ))}
        </div>

        <div className="border-ep-border mt-10 flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl border bg-white px-6 py-5 shadow-[0_1px_2px_rgba(7,32,76,0.04)]">
          <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#FDECF2]">
            <HugeiconsIcon
              icon={FavouriteIcon}
              size={22}
              strokeWidth={2}
              className="text-[#E5487A]"
            />
          </span>
          <div className="min-w-[220px] flex-1">
            <h3 className="font-display text-ep-navy m-0 text-base font-extrabold">
              Individual developer?
            </h3>
            <p className="text-ep-muted m-0 font-sans text-sm leading-[1.5]">
              Back EmbedPDF from $5 a month on GitHub Sponsors. Every sponsor counts.
            </p>
          </div>
          <a
            href={CONTACT.githubSponsors}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display text-ep-navy inline-flex h-11 items-center gap-2 rounded-[10px] border border-[rgba(7,32,76,0.12)] bg-white px-4 text-sm font-bold transition-all duration-150 hover:-translate-y-px hover:border-[rgba(229,72,122,0.45)] hover:shadow-[0_8px_20px_-8px_rgba(229,72,122,0.35)]"
          >
            <GitHubIcon size={16} />
            Sponsor on GitHub
          </a>
        </div>

        <div className="mt-14 flex flex-col items-center gap-5">
          <span className="font-display text-ep-subtle text-[11px] font-bold uppercase tracking-[0.12em]">
            Already sponsoring
          </span>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {SPONSORS.map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                title={s.name}
                className="transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105"
              >
                <SponsorLogo sponsor={s} size={s.tier === 'silver' ? 56 : 46} />
              </a>
            ))}
          </div>
          <Link
            href="/sponsors"
            className="font-display text-ep-blue hover:text-ep-blue700 inline-flex items-center gap-1.5 text-[15px] font-semibold transition-all duration-200 hover:gap-2.5"
          >
            Meet our sponsors
            <ArrowRightIcon size={14} strokeWidth={2.4} />
          </Link>
        </div>
      </div>
    </section>
  );
}
