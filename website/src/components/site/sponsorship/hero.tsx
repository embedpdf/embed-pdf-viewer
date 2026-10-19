import { FavouriteIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import { EpButton } from '../button';
import { DotGrid } from '../dot-grid';
import { Eyebrow, PillDivider } from '../eyebrow';
import { GitHubIcon, ShieldCheckIcon, StarIcon } from '../icons';
import { CONTACT, FOUNDING_SEATS, FUNDING, SPONSORS, usd } from './data';
import { SponsorLogo, TierMedal } from './parts';

const CHIP =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E9EEFF] bg-white px-3.5 py-2 font-sans text-[13px] font-medium text-[#3D4E75]';

export function SponsorshipHero() {
  return (
    <section className="bg-ep-bg relative w-full overflow-x-clip pb-[clamp(72px,9vw,130px)] pt-[clamp(56px,7vw,110px)]">
      <div className="relative mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,92px)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute left-[45%] top-[5%] hidden h-[555px] w-[633px] rounded-full bg-[#F4F7FE] min-[641px]:block" />
          <div className="absolute left-[62%] top-[-18%] hidden h-[420px] w-[480px] rounded-full bg-[#F7F2FF] min-[641px]:block" />
        </div>
        <div aria-hidden className="absolute bottom-[-150px] left-[-40px] z-0">
          <DotGrid />
        </div>

        <div className="relative z-[1] grid items-center gap-[clamp(48px,5vw,80px)] min-[1025px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col items-start gap-6">
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
              Sponsorship
            </Eyebrow>
            <h1 className="font-display text-ep-navy m-0 text-[clamp(38px,5vw,64px)] font-extrabold leading-[1.04] tracking-[-0.02em] [text-wrap:balance]">
              Help build the PDF SDK <em className="ep-grad not-italic">nobody can take away</em>
            </h1>
            <PillDivider />
            <p className="text-ep-body m-0 max-w-[540px] font-sans text-[17px] leading-[1.6]">
              EmbedPDF is the Apache-2.0 alternative to closed-source PDF SDKs that cost $15K–$700K
              a year. Sponsors fund full-time development, steer the roadmap, and get a direct line
              to the people building it.
            </p>
            <div className="mt-1 flex flex-wrap gap-3.5">
              <EpButton href="#tiers" variant="primary" icon="arrow">
                See sponsor tiers
              </EpButton>
              <EpButton href={CONTACT.call} variant="outline" icon="none">
                Book a 30-min call
              </EpButton>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={CHIP}>
                <HugeiconsIcon
                  icon={FavouriteIcon}
                  size={14}
                  strokeWidth={2.2}
                  className="text-[#E5487A]"
                />
                <b className="text-ep-navy font-bold">{SPONSORS.length}</b>
                <span>companies sponsoring</span>
              </span>
              <span className={CHIP}>
                <StarIcon size={14} className="text-ep-blue" />
                <b className="text-ep-navy font-bold">4K+</b>
                <span>stars</span>
              </span>
              <span className={CHIP}>
                <ShieldCheckIcon size={14} className="text-[#22C55E]" />
                <span>Apache-2.0, forever</span>
              </span>
            </div>
          </div>

          <FundingScene />
        </div>
      </div>
    </section>
  );
}

/**
 * The right-hand scene: the monthly goal as the main card, with the README's
 * sponsor block and the founding-seat badge floating over it — the same
 * card-over-card composition as the homepage hero.
 */
function FundingScene() {
  const pct = Math.min(100, (FUNDING.raised / FUNDING.goal) * 100);
  const next = FUNDING.milestones.find((m) => m.at > FUNDING.raised);
  return (
    <div className="relative mx-auto w-full max-w-[580px] pb-[72px] pt-[88px] max-[640px]:pb-0 max-[640px]:pt-0">
      {/* README sponsor block */}
      <div
        aria-hidden
        className="absolute right-[-12px] top-0 z-[3] w-[clamp(250px,26vw,300px)] overflow-hidden rounded-xl border border-[#1E2C5A] bg-[#0E1A40] shadow-[0_18px_40px_-12px_rgba(7,32,76,0.45)] max-[1024px]:right-0 max-[640px]:hidden"
      >
        <div className="flex items-center gap-2 border-b border-[#1E2C5A] bg-[#0A1638] px-3.5 py-2.5">
          <GitHubIcon size={14} className="text-[#8FA5D9]" />
          <span className="font-mono text-[11px] font-semibold text-[#C7DEFF]">README.md</span>
        </div>
        <div className="px-4 pb-4 pt-3.5">
          <div className="mb-3 font-mono text-[11px] text-[#7DB6FF]">
            ## <span className="text-white">Sponsors</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SPONSORS.map((s) => (
              <SponsorLogo
                key={s.name}
                sponsor={s}
                size={s.tier === 'silver' ? 34 : 28}
                className="!shadow-none"
              />
            ))}
            <span className="inline-flex h-7 items-center rounded-[7px] border border-dashed border-[#3A5390] px-2 font-sans text-[10px] font-semibold text-[#8FA5D9]">
              + you
            </span>
          </div>
        </div>
      </div>

      {/* Monthly goal */}
      <div className="relative z-[2] rounded-[22px] border border-[#E6EAF2] bg-white p-[clamp(20px,2.4vw,30px)] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_6px_rgba(7,32,76,0.05),0_30px_60px_-30px_rgba(8,118,253,0.35)]">
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-ep-subtle text-[11px] font-bold uppercase tracking-[0.1em]">
            Monthly funding
          </span>
          <span className="font-display text-ep-blue inline-flex items-center gap-1.5 rounded-full border border-[rgba(8,118,253,0.18)] bg-[rgba(8,118,253,0.08)] px-2.5 py-1 text-[11px] font-bold">
            <span className="bg-ep-blue h-1.5 w-1.5 rounded-full shadow-[0_0_0_3px_rgba(8,118,253,0.2)]" />
            Goal {usd(FUNDING.goal)}
          </span>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <b className="font-display text-ep-navy text-[clamp(40px,4.4vw,54px)] font-extrabold leading-none tracking-[-0.03em]">
            {usd(FUNDING.raised)}
          </b>
          <span className="text-ep-subtle font-sans text-[15px] font-semibold">/ month</span>
        </div>
        <p className="text-ep-muted mb-0 mt-2 font-sans text-sm">
          raised every month from our sponsors
        </p>

        <div className="relative mt-7">
          <div className="h-3 overflow-hidden rounded-full bg-[#EEF2FA]">
            <div
              className="ep-fill from-ep-blue to-ep-purple h-full rounded-full bg-gradient-to-r"
              style={{ width: `${pct}%` }}
            />
          </div>
          {FUNDING.milestones
            .filter((m) => m.at < FUNDING.goal)
            .map((m) => (
              <span
                key={m.at}
                aria-hidden
                className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#C9D5EC]"
                style={{ left: `${(m.at / FUNDING.goal) * 100}%` }}
              />
            ))}
        </div>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-sans text-[13px]">
          <span className="text-ep-navy font-bold">{Math.round(pct)}% of goal</span>
          {next && (
            <span className="text-ep-subtle">
              Next: <b className="text-ep-navy font-semibold">{usd(next.at)}</b> · {next.label}
            </span>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-[rgba(7,32,76,0.07)] pt-5">
          <div className="flex items-center">
            {SPONSORS.map((s, i) => (
              <SponsorLogo
                key={s.name}
                sponsor={s}
                size={32}
                className={`ring-[3px] ring-white ${i ? '-ml-1.5' : ''}`}
              />
            ))}
          </div>
          <a
            href="#tiers"
            className="font-display text-ep-blue hover:text-ep-blue700 inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-bold"
          >
            Join them →
          </a>
        </div>
      </div>

      {/* Founding seats */}
      <div className="absolute bottom-0 left-[-28px] z-[3] flex w-[clamp(240px,24vw,290px)] items-center gap-3.5 rounded-2xl border border-[#E9EEFF] bg-white p-4 shadow-[0_12px_32px_rgba(14,26,64,0.14)] max-[1024px]:left-0 max-[640px]:hidden">
        <TierMedal tier="gold" size={38} />
        <div className="min-w-0">
          <div className="font-display text-ep-navy text-sm font-extrabold tracking-[-0.005em]">
            {FOUNDING_SEATS} founding seats
          </div>
          <div className="text-ep-subtle font-sans text-xs leading-[1.4]">
            Year-long sponsors, recognized permanently.
          </div>
        </div>
      </div>
    </div>
  );
}
