'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

import { ArrowRight, CheckIcon } from './icons';
import { useSalesDialog } from './sales-dialog';

type Billing = 'monthly' | 'annual';

const FEATURES: { name: string; icon: ReactNode }[] = [
  {
    name: 'Annotations',
    icon: (
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>
    ),
  },
  {
    name: 'Role-based access',
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
        <path d="M16 7a3 3 0 0 1 0 6M21 20c0-2.5-1.5-4-3.5-4.7" />
      </>
    ),
  },
  {
    name: 'Signed URLs',
    icon: <path d="M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1" />,
  },
  {
    name: 'BYO storage',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="1.5" />
        <path d="M8 20h8M12 16v4" />
      </>
    ),
  },
  {
    name: 'Audit logs',
    icon: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
  },
  {
    name: 'SSO / SAML',
    icon: (
      <>
        <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
  {
    name: 'Priority support',
    icon: <path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" />,
  },
];

function FeatureList() {
  return (
    <ul className="mt-5 flex flex-col">
      {FEATURES.map((f) => (
        <li
          key={f.name}
          className="text-cp-ink flex items-center gap-3 px-1 py-[5px] font-sans text-[15px] leading-[1.3]"
        >
          <span className="text-cp-blue inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#EEF4FF]">
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {f.icon}
            </svg>
          </span>
          <span className="flex-1">{f.name}</span>
          <span className="text-cp-blue flex-shrink-0">
            <CheckIcon width={18} height={18} strokeWidth={2.4} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Plan({
  icon,
  name,
  tagline,
  monthly,
  annual,
  includesMonthly,
  includesAnnual,
  billing,
  variant,
}: {
  icon: ReactNode;
  name: string;
  tagline: string;
  monthly: string;
  annual: string;
  includesMonthly: string;
  includesAnnual: string;
  billing: Billing;
  variant: 'primary' | 'outline';
}) {
  const isAnnual = billing === 'annual';
  return (
    <div className="border-cp-border flex flex-col rounded-[20px] border bg-white p-[30px] pb-[26px] shadow-[0_1px_2px_rgba(10,26,77,0.04),0_18px_40px_-28px_rgba(10,26,77,0.18)] transition-all hover:border-[#CFE0FF] hover:shadow-[0_1px_2px_rgba(10,26,77,0.04),0_26px_56px_-28px_rgba(22,119,255,0.3)]">
      <div className="flex items-center gap-4">
        <span className="bg-cp-surface text-cp-blue inline-flex h-[54px] w-[54px] flex-shrink-0 items-center justify-center rounded-[14px]">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="font-display text-cp-navy text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em]">
            {name}
          </div>
          <div className="text-cp-blue mt-1 font-sans text-[13px] font-medium leading-[1.35]">
            {tagline}
          </div>
        </div>
      </div>

      <div className="mt-[26px]">
        <div className="text-cp-muted font-sans text-sm">Starting at</div>
        <div className="mt-2.5 flex items-baseline gap-1">
          <span className="font-display text-cp-blue text-[44px] font-extrabold leading-none tracking-[-0.03em]">
            {isAnnual ? annual : monthly}
          </span>
          <span className="text-cp-muted font-sans text-base">/mo</span>
        </div>
        <div className="text-cp-muted mt-3 font-sans text-[13.5px] leading-[1.4]">
          {isAnnual ? includesAnnual : includesMonthly}
        </div>
      </div>

      <div className="bg-cp-borderSoft mt-[22px] h-px" />

      <FeatureList />

      <a
        href="#"
        className={`mt-[26px] flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[10px] font-sans text-base font-bold no-underline transition-all ${
          variant === 'primary'
            ? 'bg-cp-blue hover:bg-cp-blue600 text-white hover:shadow-[0_8px_20px_rgba(22,119,255,0.28)]'
            : 'border-cp-blue text-cp-blue hover:border-cp-blue600 hover:text-cp-blue600 border-2 hover:bg-[rgba(22,119,255,0.08)]'
        }`}
      >
        <span>Start free trial</span>
        <ArrowRight width={20} height={20} />
      </a>
    </div>
  );
}

export function PricingView() {
  const { openSalesDialog } = useSalesDialog();
  const [billing, setBilling] = useState<Billing>('monthly');

  return (
    <section className="bg-cp-bg relative w-full overflow-clip py-[clamp(48px,6vw,88px)] pb-[clamp(64px,8vw,120px)]">
      {/* decorations */}
      <div
        className="cp-dots pointer-events-none absolute right-[clamp(20px,4vw,70px)] top-1.5 z-0 h-[110px] w-[132px] text-[#ABC9FD] max-[1040px]:hidden"
        style={{
          WebkitMaskImage: 'linear-gradient(115deg, #000 35%, transparent 92%)',
          maskImage: 'linear-gradient(115deg, #000 35%, transparent 92%)',
        }}
      />
      <div
        className="cp-dots pointer-events-none absolute bottom-[86px] left-[clamp(20px,4vw,78px)] z-0 h-[110px] w-[132px] text-[#ABC9FD] max-[1040px]:hidden"
        style={{
          WebkitMaskImage: 'linear-gradient(295deg, #000 35%, transparent 92%)',
          maskImage: 'linear-gradient(295deg, #000 35%, transparent 92%)',
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/Cloud-3-pale.svg"
        alt=""
        className="pointer-events-none absolute -bottom-[70px] -left-[90px] z-0 h-auto w-[360px] select-none opacity-50 max-[1040px]:hidden"
      />

      <div className="relative z-[1] mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,78px)]">
        <div className="grid grid-cols-1 items-center gap-11 min-[1041px]:grid-cols-[minmax(360px,0.92fr)_minmax(0,1.42fr)] min-[1041px]:gap-[clamp(28px,4vw,72px)]">
          {/* INTRO */}
          <div className="flex min-w-0 flex-col">
            <span className="bg-cp-surface font-display text-cp-blue inline-flex items-center gap-2.5 self-start rounded-full border border-[#D4E4FF] py-[9px] pl-[13px] pr-4 text-sm font-bold tracking-[-0.01em]">
              <svg
                width={17}
                height={17}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0"
              >
                <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
                <path d="M9 13h6M9 17h4" />
              </svg>
              Simple, transparent pricing
            </span>
            <h1 className="font-display text-cp-navy mt-[26px] text-[clamp(40px,4.6vw,60px)] font-extrabold leading-[1.04] tracking-[-0.025em]">
              Pricing that <em className="text-cp-blue not-italic">scales with</em> your product.
            </h1>
            <div className="bg-cp-blue mt-[30px] h-[7px] w-16 rounded-[10px]" />
            <p className="text-cp-ink mt-7 max-w-[430px] font-sans text-[19px] leading-[1.6]">
              Choose the deployment model that fits your needs today. Upgrade or switch anytime as
              you grow.
            </p>

            <div className="mt-[clamp(36px,4vw,52px)]">
              <div className="font-display text-cp-navy text-[15px] font-bold tracking-[-0.01em]">
                Billing
              </div>
              <div className="border-cp-border mt-3 inline-flex rounded-xl border bg-white p-[5px] shadow-[0_1px_2px_rgba(10,26,77,0.05)]">
                {(['monthly', 'annual'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={billing === mode}
                    onClick={() => setBilling(mode)}
                    className={`h-[42px] cursor-pointer rounded-[9px] px-[26px] font-sans text-[15px] font-bold capitalize transition-all ${
                      billing === mode
                        ? 'bg-cp-surface text-cp-blue shadow-[0_1px_2px_rgba(22,119,255,0.12),inset_0_0_0_1px_rgba(22,119,255,0.18)]'
                        : 'text-cp-muted'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="text-cp-muted mt-3.5 font-sans text-sm leading-[1.5]">
                Save up to <b className="text-cp-blue font-bold">20%</b> with annual billing
              </div>
            </div>
          </div>

          {/* CARDS */}
          <div className="flex flex-col gap-[22px]">
            <div className="grid grid-cols-1 gap-[22px] min-[621px]:grid-cols-2">
              <Plan
                billing={billing}
                variant="primary"
                name="Managed SaaS"
                tagline="We host and manage everything."
                monthly="$199"
                annual="$165"
                includesMonthly="Includes 10,000 documents / month"
                includesAnnual="Billed $1,980 annually · 10,000 documents / month"
                icon={
                  <svg
                    width={28}
                    height={28}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 18a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 17 8.5a4 4 0 0 1 .5 9.5H7z" />
                  </svg>
                }
              />
              <Plan
                billing={billing}
                variant="outline"
                name="Self-hosted"
                tagline="Deploy in your own infrastructure."
                monthly="$999"
                annual="$799"
                includesMonthly="Includes 10,000 documents / month"
                includesAnnual="Billed annually · 10,000 documents / month"
                icon={
                  <svg
                    width={26}
                    height={26}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="6" rx="1.5" />
                    <rect x="3" y="14" width="18" height="6" rx="1.5" />
                    <path d="M7 7h.01M7 17h.01" />
                  </svg>
                }
              />
            </div>

            {/* Enterprise band */}
            <div className="border-cp-border flex items-center gap-[26px] rounded-[20px] border bg-white px-8 py-[26px] shadow-[0_1px_2px_rgba(10,26,77,0.04),0_18px_40px_-30px_rgba(10,26,77,0.16)] max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-5">
              <span className="text-cp-violet inline-flex h-[60px] w-[60px] flex-shrink-0 items-center justify-center rounded-[15px] bg-[#F0ECFF]">
                <svg
                  width={30}
                  height={30}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="3" width="11" height="18" rx="1.5" />
                  <path d="M15 8h4a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-4" />
                  <path d="M8 7h3M8 11h3M8 15h3" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-cp-navy text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em]">
                  Enterprise
                </div>
                <div className="text-cp-violet mt-1.5 font-sans text-[15.5px] font-semibold leading-[1.4]">
                  Need custom scale, SLAs, or dedicated support?
                </div>
                <div className="text-cp-muted mt-0.5 font-sans text-[14.5px] leading-[1.4]">
                  Contact our team for custom pricing and solutions.
                </div>
              </div>
              <button
                className="border-cp-violet text-cp-violet hover:border-cp-violetDeep hover:text-cp-violetDeep flex h-[50px] flex-shrink-0 cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border-2 px-[22px] font-sans text-base font-bold transition-all hover:bg-[rgba(124,92,252,0.08)] max-[720px]:w-full"
                data-testid="pricing-enterprise-contact-sales"
                onClick={() =>
                  openSalesDialog({
                    placement: 'pricing-enterprise',
                    productInterest: 'not-sure',
                  })
                }
                type="button"
              >
                <span>Contact sales</span>
                <ArrowRight width={20} height={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
