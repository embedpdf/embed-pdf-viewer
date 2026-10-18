import { Target02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import { FUNDING, usd } from './data';
import { CheckDot, SectionHead } from './parts';

const FUNDS = [
  'A full-time lead developer, not nights and weekends',
  'A senior mobile developer for native SDKs',
  'A faster roadmap that sponsors help steer',
];

const GETS = [
  'Multi-platform PDF SDKs you can read and fork',
  'A real voice on what gets built next',
  '80–95% less than a commercial licence',
];

/** Progress ring: the share of the monthly goal already pledged. */
function Ring({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[136px] w-[136px] flex-shrink-0">
      <svg viewBox="0 0 136 136" className="h-full w-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="ep-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0876FD" />
            <stop offset="1" stopColor="#9747FF" />
          </linearGradient>
        </defs>
        <circle cx="68" cy="68" r={r} fill="none" stroke="#EEF2FA" strokeWidth="14" />
        <circle
          cx="68"
          cy="68"
          r={r}
          fill="none"
          stroke="url(#ep-ring)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <b className="font-display text-ep-navy text-[30px] font-extrabold leading-none tracking-[-0.02em]">
          {Math.round(pct)}%
        </b>
        <span className="text-ep-subtle mt-1 font-sans text-[11px] font-semibold uppercase tracking-[0.08em]">
          funded
        </span>
      </div>
    </div>
  );
}

export function FundingGoal() {
  const pct = Math.min(100, (FUNDING.raised / FUNDING.goal) * 100);
  return (
    <section className="relative w-full overflow-hidden bg-white py-[clamp(70px,9vw,130px)]">
      <div className="relative z-[1] mx-auto w-full max-w-[1120px] px-[clamp(20px,4vw,40px)]">
        <SectionHead
          eyebrow="Funding goal"
          icon={
            <HugeiconsIcon icon={Target02Icon} size={14} strokeWidth={2} className="text-ep-blue" />
          }
          title={
            <>
              Where your sponsorship <em className="ep-grad not-italic">goes</em>
            </>
          }
          lede="One public monthly goal. Every dollar becomes engineering time on code you can read."
        />

        <div className="mt-12 rounded-[24px] border border-[#E6EAF2] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFCFF_100%)] p-[clamp(22px,3.4vw,44px)] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_6px_rgba(7,32,76,0.04),0_30px_60px_-34px_rgba(7,32,76,0.22)]">
          <div className="flex flex-wrap items-center gap-[clamp(20px,3vw,40px)]">
            <Ring pct={pct} />
            <div className="min-w-[220px] flex-1">
              <span className="font-display text-ep-subtle text-[11px] font-bold uppercase tracking-[0.1em]">
                Raised each month
              </span>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <b className="font-display text-ep-navy text-[clamp(40px,4.6vw,56px)] font-extrabold leading-none tracking-[-0.03em]">
                  {usd(FUNDING.raised)}
                </b>
                <span className="text-ep-muted font-sans text-base font-semibold">
                  of {usd(FUNDING.goal)} / month
                </span>
              </div>
              <p className="text-ep-muted mb-0 mt-3 max-w-[52ch] font-sans text-[15px] leading-[1.55]">
                {usd(FUNDING.goal)} a month pays for two senior engineers working full-time — the
                output a big vendor needs a team of five to ten for.
              </p>
            </div>
          </div>

          {/* The goal as a road: fill to today, a pin per milestone. */}
          <div className="mt-10">
            <div className="relative h-4 rounded-full bg-[#EEF2FA]">
              <div
                className="from-ep-blue to-ep-purple absolute inset-y-0 left-0 rounded-full bg-gradient-to-r shadow-[0_4px_14px_-4px_rgba(8,118,253,0.55)]"
                style={{ width: `${pct}%` }}
              />
              <span
                aria-hidden
                className="border-ep-blue absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] bg-white shadow-[0_2px_8px_rgba(8,118,253,0.4)]"
                style={{ left: `${pct}%` }}
              />
              {FUNDING.milestones.map((m) => (
                <span
                  key={m.at}
                  aria-hidden
                  className="absolute top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C9D5EC]"
                  style={{
                    left: `calc(${(m.at / FUNDING.goal) * 100}% - ${m.at === FUNDING.goal ? 2 : 0}px)`,
                  }}
                />
              ))}
            </div>
            <ol className="m-0 mt-5 grid list-none gap-4 p-0 min-[641px]:grid-cols-3">
              <li className="flex flex-col">
                <span className="font-display text-ep-blue text-sm font-extrabold">Today</span>
                <span className="text-ep-muted font-sans text-[13px] leading-[1.45]">
                  {usd(FUNDING.raised)} / month pledged
                </span>
              </li>
              {FUNDING.milestones.map((m) => (
                <li
                  key={m.at}
                  className={`flex flex-col ${m.at === FUNDING.goal ? 'min-[641px]:items-end min-[641px]:text-right' : 'min-[641px]:items-center min-[641px]:text-center'}`}
                >
                  <span className="font-display text-ep-navy text-sm font-extrabold">
                    {usd(m.at)} / month
                  </span>
                  <span className="text-ep-muted font-sans text-[13px] leading-[1.45]">
                    {m.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-10 grid gap-[clamp(20px,3vw,40px)] border-t border-[rgba(7,32,76,0.07)] pt-8 min-[721px]:grid-cols-2">
            <List title="Your sponsorship funds" items={FUNDS} color="#0876FD" />
            <List title="Your team gets" items={GETS} color="#9747FF" />
          </div>
        </div>
      </div>
    </section>
  );
}

function List({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div>
      <h3 className="font-display text-ep-navy m-0 mb-4 text-[17px] font-extrabold tracking-[-0.005em]">
        {title}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((item) => (
          <li
            key={item}
            className="text-ep-ink flex items-start gap-3 font-sans text-[15px] leading-[1.5]"
          >
            <CheckDot color={color} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
