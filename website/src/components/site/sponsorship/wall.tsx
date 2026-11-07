import { FavouriteIcon, PlusSignIcon, SparklesIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import { EpButton } from '../button';
import { DotGrid } from '../dot-grid';
import { Eyebrow, PillDivider } from '../eyebrow';
import { ArrowRightIcon, ExtLinkIcon, GitHubIcon } from '../icons';
import { CONTACT, SPONSORS, TIERS, mailto, sponsorsIn, type Sponsor, type TierId } from './data';
import { SponsorLogo, TIER_TONE, TierMedal } from './parts';

type Slot = { side: 'left' | 'right'; x: string; y: string; r: number; delay: string };

// Hero constellation: silver sponsors take the two large slots up top, the
// rest fill the small ones in order. Desktop only — below that the wall
// itself is a screen away.
const BIG_SLOTS: Slot[] = [
  { side: 'left', x: '6%', y: '16%', r: -6, delay: '0s' },
  { side: 'right', x: '6%', y: '20%', r: 6, delay: '-2.5s' },
];
const SMALL_SLOTS: Slot[] = [
  { side: 'left', x: '19%', y: '0%', r: 5, delay: '-1s' },
  { side: 'right', x: '18%', y: '2%', r: -4, delay: '-4s' },
  { side: 'left', x: '15%', y: '60%', r: 4, delay: '-3s' },
  { side: 'right', x: '16%', y: '62%', r: -5, delay: '-5s' },
  { side: 'left', x: '4%', y: '76%', r: -8, delay: '-2s' },
  { side: 'right', x: '4%', y: '78%', r: 7, delay: '-6s' },
];

function slotStyle(s: Slot): CSSProperties {
  return { [s.side]: s.x, top: s.y, transform: `rotate(${s.r}deg)` };
}

export function SponsorsHero() {
  const silver = sponsorsIn('silver');
  const rest = SPONSORS.filter((s) => s.tier !== 'silver');
  const placed: [Sponsor, Slot, number][] = [
    ...silver
      .slice(0, BIG_SLOTS.length)
      .map((s, i) => [s, BIG_SLOTS[i], 104] as [Sponsor, Slot, number]),
    ...rest
      .slice(0, SMALL_SLOTS.length)
      .map((s, i) => [s, SMALL_SLOTS[i], i < 2 ? 60 : 68] as [Sponsor, Slot, number]),
  ];
  const counts = (['gold', 'silver', 'bronze'] as TierId[]).map((t) => ({
    t,
    n: sponsorsIn(t).length,
  }));

  return (
    <section className="bg-ep-bg relative w-full overflow-hidden pb-[clamp(64px,8vw,110px)] pt-[clamp(64px,8vw,120px)]">
      <div className="relative mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,80px)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden min-[1101px]:block">
          <div className="absolute left-1/2 top-[-30%] h-[620px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#EEF4FF_0%,rgba(238,244,255,0)_100%)]" />
          {placed.map(([s, slot, size]) => (
            <div key={s.name} className="absolute" style={slotStyle(slot)}>
              <div className="ep-float" style={{ animationDelay: slot.delay }}>
                <SponsorLogo
                  sponsor={s}
                  size={size}
                  className="!shadow-[0_0_0_1px_rgba(7,32,76,0.06),0_18px_36px_-14px_rgba(7,32,76,0.35)]"
                />
              </div>
            </div>
          ))}
        </div>
        <div aria-hidden className="absolute bottom-[-190px] left-[-30px] min-[1101px]:hidden">
          <DotGrid />
        </div>

        <div className="relative z-[1] mx-auto flex max-w-[700px] flex-col items-center text-center">
          <div className="mb-6">
            <Eyebrow
              icon={
                <HugeiconsIcon
                  icon={FavouriteIcon}
                  size={14}
                  strokeWidth={2.2}
                  className="text-ep-blue"
                />
              }
            >
              Our sponsors
            </Eyebrow>
          </div>
          <h1 className="font-display text-ep-navy m-0 mb-6 text-[clamp(38px,5vw,64px)] font-extrabold leading-[1.04] tracking-[-0.02em] [text-wrap:balance]">
            The companies keeping <em className="ep-grad not-italic">PDF open</em>
          </h1>
          <PillDivider gradient />
          <p className="text-ep-body mb-0 mt-6 max-w-[560px] font-sans text-[17px] leading-[1.6]">
            EmbedPDF is free and Apache-2.0 licensed because these companies choose to fund it in
            the open. Every release you install is partly theirs. Thank you.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3.5">
            <EpButton href="/sponsorship" variant="primary" icon="arrow">
              Become a sponsor
            </EpButton>
            <EpButton href={CONTACT.githubSponsors} variant="outline" icon="none">
              Sponsor on GitHub
            </EpButton>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {counts.map(({ t, n }) => (
              <a
                key={t}
                href={`#${t}`}
                className={`font-display inline-flex items-center gap-2 rounded-full border py-1.5 pl-2 pr-3.5 text-[13px] font-bold transition-transform duration-150 hover:-translate-y-px ${TIER_TONE[t].chip}`}
              >
                <TierMedal tier={t} size={18} />
                <span className="capitalize">{t}</span>
                <span className="font-semibold opacity-75">{n ? `· ${n}` : '· open'}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TierHeading({ tier, count }: { tier: TierId; count: number }) {
  const t = TIERS.find((x) => x.id === tier)!;
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-4">
        <TierMedal tier={tier} size={46} />
        <div>
          <h2 className="font-display text-ep-navy m-0 text-[clamp(24px,2.4vw,30px)] font-extrabold leading-[1.15] tracking-[-0.015em]">
            {t.name} sponsors
          </h2>
          <p className="text-ep-subtle m-0 font-sans text-sm">
            {t.price} / month ·{' '}
            {count === 0 ? 'no sponsors yet' : `${count} ${count === 1 ? 'company' : 'companies'}`}
          </p>
        </div>
      </div>
      <Link
        href="/sponsorship#tiers"
        className="font-display text-ep-blue hover:text-ep-blue700 inline-flex items-center gap-1.5 text-sm font-semibold transition-all duration-200 hover:gap-2.5"
      >
        Become {t.name === 'Gold' ? 'our first Gold' : `a ${t.name}`} sponsor
        <ArrowRightIcon size={13} strokeWidth={2.4} />
      </Link>
    </div>
  );
}

const CARD =
  'group relative flex rounded-[20px] border border-ep-border bg-white transition-all duration-200 ' +
  'shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_1px_2px_rgba(7,32,76,0.04),0_12px_32px_-18px_rgba(7,32,76,0.12)] ' +
  'hover:-translate-y-[3px] hover:border-[rgba(8,118,253,0.30)] ' +
  'hover:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_4px_rgba(7,32,76,0.06),0_22px_44px_-18px_rgba(8,118,253,0.22)]';

function FeaturedSponsor({ sponsor }: { sponsor: Sponsor }) {
  return (
    <a
      href={sponsor.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${CARD} flex-col items-start gap-5 p-7`}
    >
      <span
        className={`font-display absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5 text-[11px] font-bold ${TIER_TONE[sponsor.tier].chip}`}
      >
        <TierMedal tier={sponsor.tier} size={14} />
        <span className="capitalize">{sponsor.tier}</span>
      </span>
      <SponsorLogo sponsor={sponsor} size={84} />
      <div>
        <h3 className="font-display text-ep-navy m-0 text-xl font-extrabold tracking-[-0.01em]">
          {sponsor.name}
        </h3>
        {sponsor.description && (
          <p className="text-ep-muted m-0 mt-1.5 font-sans text-[15px] leading-[1.55]">
            {sponsor.description}
          </p>
        )}
      </div>
      <span className="text-ep-blue mt-auto inline-flex items-center gap-1.5 font-sans text-[13px] font-semibold transition-all duration-150 group-hover:gap-2">
        {new URL(sponsor.url).hostname.replace(/^www\./, '')}
        <ExtLinkIcon />
      </span>
    </a>
  );
}

function CompactSponsor({ sponsor }: { sponsor: Sponsor }) {
  return (
    <a
      href={sponsor.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Visit ${sponsor.name}`}
      className={`${CARD} flex-col items-center gap-3.5 px-4 pb-5 pt-6 text-center`}
    >
      <SponsorLogo sponsor={sponsor} size={64} />
      <span className="font-display text-ep-navy text-[15px] font-bold">{sponsor.name}</span>
      <span className="text-ep-faint group-hover:text-ep-blue absolute right-3 top-3 transition-colors duration-150">
        <ExtLinkIcon size={12} />
      </span>
    </a>
  );
}

/** The dashed "your logo here" slot that closes every tier's row. */
function OpenSlot({ tier, compact = false }: { tier: TierId; compact?: boolean }) {
  const tone = TIER_TONE[tier];
  const name = TIERS.find((t) => t.id === tier)!.name;
  return (
    <a
      href={mailto(`${name} sponsorship`)}
      className={`group flex flex-col items-center justify-center rounded-[20px] border-2 border-dashed text-center transition-all duration-200 hover:-translate-y-[3px] ${tone.slot} ${tone.slotHover} ${
        compact ? 'gap-2.5 px-4 py-6' : 'gap-3 p-7'
      }`}
    >
      <span
        className={`inline-flex items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(7,32,76,0.08)] transition-transform duration-200 group-hover:rotate-90 ${
          compact ? 'h-10 w-10' : 'h-12 w-12'
        }`}
      >
        <HugeiconsIcon
          icon={PlusSignIcon}
          size={compact ? 18 : 22}
          strokeWidth={2.2}
          className="text-ep-blue"
        />
      </span>
      <span className="font-display text-ep-navy text-[15px] font-bold">Your logo here</span>
      {!compact && (
        <span className="text-ep-subtle font-sans text-[13px]">Join the {name} tier</span>
      )}
    </a>
  );
}

/** Gold has no sponsor yet, so its empty slot is the headline of the row. */
function GoldInvite() {
  const gold = TIERS.find((t) => t.id === 'gold')!;
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] border-2 border-dashed p-[clamp(24px,4vw,44px)] ${TIER_TONE.gold.slot}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-80px] top-[-80px] h-[280px] w-[280px] rounded-full bg-[radial-gradient(closest-side,rgba(245,181,38,0.22),transparent)]"
      />
      <div className="relative grid items-center gap-8 min-[861px]:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="relative inline-flex h-24 w-24 items-center justify-center rounded-[24%] border-2 border-dashed border-[#E3C574] bg-white">
          <HugeiconsIcon
            icon={SparklesIcon}
            size={34}
            strokeWidth={1.8}
            className="text-[#C98A0C]"
          />
        </div>
        <div>
          <h3 className="font-display text-ep-navy m-0 text-[clamp(22px,2.2vw,28px)] font-extrabold leading-[1.2] tracking-[-0.01em]">
            This spot is waiting for our first Gold sponsor
          </h3>
          <p className="text-ep-muted m-0 mt-2 max-w-[56ch] font-sans text-[15px] leading-[1.6]">
            Weekly access to the team, custom feature development, migration consulting and
            co-marketing, plus the top spot on this wall.
          </p>
        </div>
        <a
          href={mailto('Gold sponsorship')}
          className="font-display bg-ep-blue hover:bg-ep-blue600 inline-flex h-[50px] items-center gap-2 justify-self-start whitespace-nowrap rounded-[10px] px-[22px] text-base font-bold text-white transition-all duration-150 hover:-translate-y-px hover:shadow-[0_8px_20px_rgba(8,118,253,0.28)]"
        >
          {gold.cta}
          <ArrowRightIcon size={18} />
        </a>
      </div>
    </div>
  );
}

export function SponsorWall() {
  const gold = sponsorsIn('gold');
  const silver = sponsorsIn('silver');
  const bronze = sponsorsIn('bronze');
  return (
    <section className="relative w-full bg-white py-[clamp(70px,8vw,120px)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[clamp(64px,7vw,96px)] px-[clamp(20px,4vw,40px)]">
        <div id="gold" className="scroll-mt-[110px]">
          <TierHeading tier="gold" count={gold.length} />
          {gold.length === 0 ? (
            <GoldInvite />
          ) : (
            <div className="grid gap-5 min-[761px]:grid-cols-2">
              {gold.map((s) => (
                <FeaturedSponsor key={s.name} sponsor={s} />
              ))}
              <OpenSlot tier="gold" />
            </div>
          )}
        </div>

        <div id="silver" className="scroll-mt-[110px]">
          <TierHeading tier="silver" count={silver.length} />
          <div className="grid gap-5 min-[641px]:grid-cols-2 min-[1025px]:grid-cols-3">
            {silver.map((s) => (
              <FeaturedSponsor key={s.name} sponsor={s} />
            ))}
            <OpenSlot tier="silver" />
          </div>
        </div>

        <div id="bronze" className="scroll-mt-[110px]">
          <TierHeading tier="bronze" count={bronze.length} />
          <div className="grid grid-cols-2 gap-4 min-[641px]:grid-cols-3 min-[1025px]:grid-cols-6">
            {bronze.map((s) => (
              <CompactSponsor key={s.name} sponsor={s} />
            ))}
            <OpenSlot tier="bronze" compact />
          </div>
        </div>

        <div className="border-ep-border flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[20px] border bg-[#FBFCFE] px-[clamp(20px,3vw,32px)] py-6">
          <span className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[14px] bg-[#F2F3F5]">
            <GitHubIcon size={26} className="text-[#181717]" />
          </span>
          <div className="min-w-[220px] flex-1">
            <h3 className="font-display text-ep-navy m-0 text-lg font-extrabold">
              Sponsoring as an individual?
            </h3>
            <p className="text-ep-muted m-0 mt-0.5 font-sans text-sm leading-[1.55]">
              Back EmbedPDF from $5 a month on GitHub Sponsors. Every sponsor counts.
            </p>
          </div>
          <a
            href={CONTACT.githubSponsors}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display text-ep-navy inline-flex h-11 items-center gap-2 rounded-[10px] border border-[rgba(7,32,76,0.12)] bg-white px-4 text-sm font-bold transition-all duration-150 hover:-translate-y-px hover:border-[rgba(229,72,122,0.45)] hover:shadow-[0_8px_20px_-8px_rgba(229,72,122,0.35)]"
          >
            <HugeiconsIcon
              icon={FavouriteIcon}
              size={16}
              strokeWidth={2.2}
              className="text-[#E5487A]"
            />
            Sponsor on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
