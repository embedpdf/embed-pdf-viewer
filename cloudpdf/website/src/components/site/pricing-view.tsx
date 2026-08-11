'use client';

import {
  Analytics01Icon,
  ApiIcon,
  Link02Icon,
  PencilEdit02Icon,
  SourceCodeIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import type { PublicPlan } from '../../lib/saas-plans';
import { PORTAL_URL } from '../../lib/site-urls';
import { ArrowRight, CheckIcon } from './icons';
import { useSalesDialog } from './sales-dialog';

type Billing = 'monthly' | 'annual';

/**
 * The two managed tiers render straight from the platform catalog:
 * price, included usage, and trial length are data, never copy. The
 * taglines and shared feature labels below are the page's judgment.
 */
const TIER_COPY: Record<string, { tagline: string }> = {
  growth: { tagline: 'More capacity for growing teams.' },
  standard: { tagline: 'A focused production workspace.' },
};

const SHARED_FEATURES: { icon: IconSvgElement; name: string }[] = [
  { name: 'Embeddable viewer snippet', icon: SourceCodeIcon },
  { name: 'Public share links, domain-locked', icon: Link02Icon },
  { name: 'Annotations & forms', icon: PencilEdit02Icon },
  { name: 'Developer API & SDKs', icon: ApiIcon },
  { name: 'Usage dashboard', icon: Analytics01Icon },
];

function formatMoneyMinor(minor: number): string {
  const dollars = minor / 100;
  return `$${dollars.toLocaleString('en-US', {
    maximumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
  })}`;
}

function formatCount(limitValue: string): string {
  return Number(limitValue).toLocaleString('en-US');
}

function formatStorage(limitValue: string): string {
  return `${Math.round(Number(limitValue) / 1024 ** 3)} GB`;
}

function meterLines(plan: PublicPlan): string[] {
  const byMetric = new Map(plan.meters.map((meter) => [meter.metricCode, meter]));
  const views = byMetric.get('pdf.views');
  const uploads = byMetric.get('pdf.uploads');
  const storage = byMetric.get('storage.bytes');
  return [
    ...(views ? [`${formatCount(views.limitValue)} document views / month`] : []),
    ...(uploads ? [`${formatCount(uploads.limitValue)} uploads / month`] : []),
    ...(storage ? [`${formatStorage(storage.limitValue)} storage`] : []),
  ];
}

function Plan({
  billing,
  icon,
  monthlyPlan,
  annualPlan,
  tier,
  variant,
}: {
  annualPlan: PublicPlan;
  billing: Billing;
  icon: ReactNode;
  monthlyPlan: PublicPlan;
  tier: string;
  variant: 'outline' | 'primary';
}) {
  const isAnnual = billing === 'annual';
  const active = isAnnual ? annualPlan : monthlyPlan;
  const annualTotalMinor = Number(annualPlan.unitAmountMinor);
  const perMonthMinor = isAnnual
    ? Math.round(annualTotalMinor / 12)
    : Number(monthlyPlan.unitAmountMinor);
  const name = tier.charAt(0).toUpperCase() + tier.slice(1);
  const included = meterLines(active);

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
            {TIER_COPY[tier]?.tagline ?? 'Managed CloudPDF workspace.'}
          </div>
        </div>
      </div>

      <div className="mt-[26px]">
        <div className="text-cp-muted font-sans text-sm">
          {active.trialDays}-day free trial, then
        </div>
        <div className="mt-2.5 flex items-baseline gap-1">
          <span className="font-display text-cp-blue text-[44px] font-extrabold leading-none tracking-[-0.03em]">
            {formatMoneyMinor(perMonthMinor)}
          </span>
          <span className="text-cp-muted font-sans text-base">/mo</span>
        </div>
        <div className="text-cp-muted mt-3 font-sans text-[13.5px] leading-[1.4]">
          {isAnnual
            ? `Billed ${formatMoneyMinor(annualTotalMinor)} annually`
            : 'Billed monthly · cancel anytime'}
        </div>
      </div>

      <div className="bg-cp-borderSoft mt-[22px] h-px" />

      <ul className="mt-5 flex flex-col">
        {included.map((line) => (
          <li
            key={line}
            className="text-cp-ink flex items-center gap-3 px-1 py-[5px] font-sans text-[15px] font-semibold leading-[1.3]"
          >
            {/* w-7 matches the width of the feature icon boxes below so both
                lists start their text at the same x. Deliberately no h-7 —
                that would pad these rows to 28px and space them out. */}
            <span className="text-cp-blue inline-flex w-7 flex-shrink-0 items-center justify-center">
              <CheckIcon width={18} height={18} strokeWidth={2.4} />
            </span>
            <span className="flex-1">{line}</span>
          </li>
        ))}
      </ul>

      {/*
        Two different kinds of claim: the list above is this tier's quota, the
        list below ships with every plan. They were one <ul> with identical
        spacing, so the groups ran together.
      */}
      <ul className="mt-[18px] flex flex-col">
        {SHARED_FEATURES.map((feature) => (
          <li
            key={feature.name}
            className="text-cp-ink flex items-center gap-3 px-1 py-[5px] font-sans text-[15px] leading-[1.3]"
          >
            <span className="text-cp-blue inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#EEF4FF]">
              <HugeiconsIcon icon={feature.icon} size={16} strokeWidth={2} />
            </span>
            <span className="flex-1">{feature.name}</span>
          </li>
        ))}
      </ul>

      <a
        href={`${PORTAL_URL}/saas?plan=${encodeURIComponent(active.code)}`}
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

export function PricingView({ plans }: { plans: PublicPlan[] }) {
  const { openSalesDialog } = useSalesDialog();
  const [billing, setBilling] = useState<Billing>('annual');

  const byTier = useMemo(() => {
    const map = new Map<string, { annual?: PublicPlan; monthly?: PublicPlan }>();
    for (const plan of plans) {
      const entry = map.get(plan.tier) ?? {};
      if (plan.billingInterval === 'year') entry.annual = plan;
      else entry.monthly = plan;
      map.set(plan.tier, entry);
    }
    return map;
  }, [plans]);

  const standard = byTier.get('standard');
  const growth = byTier.get('growth');

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
              Start on the managed cloud with a 14-day free trial. Prefer your own infrastructure?
              Talk to us about self-hosting.
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
                Save up to <b className="text-cp-blue font-bold">17%</b> with annual billing
              </div>
            </div>
          </div>

          {/* CARDS */}
          <div className="flex flex-col gap-[22px]">
            <div className="grid grid-cols-1 gap-[22px] min-[621px]:grid-cols-2">
              {standard?.monthly && standard.annual ? (
                <Plan
                  annualPlan={standard.annual}
                  billing={billing}
                  monthlyPlan={standard.monthly}
                  tier="standard"
                  variant="outline"
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
              ) : null}
              {growth?.monthly && growth.annual ? (
                <Plan
                  annualPlan={growth.annual}
                  billing={billing}
                  monthlyPlan={growth.monthly}
                  tier="growth"
                  variant="primary"
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
                      <path d="M3 17l6-6 4 4 8-8" />
                      <path d="M14 7h7v7" />
                    </svg>
                  }
                />
              ) : null}
            </div>

            {/* Self-hosted band: licensed software is a conversation, not a cart. */}
            <div className="border-cp-border flex items-center gap-[26px] rounded-[20px] border bg-white px-8 py-[26px] shadow-[0_1px_2px_rgba(10,26,77,0.04),0_18px_40px_-30px_rgba(10,26,77,0.16)] max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-5">
              <span className="text-cp-blue bg-cp-surface inline-flex h-[60px] w-[60px] flex-shrink-0 items-center justify-center rounded-[15px]">
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
                  <rect x="3" y="4" width="18" height="6" rx="1.5" />
                  <rect x="3" y="14" width="18" height="6" rx="1.5" />
                  <path d="M7 7h.01M7 17h.01" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-cp-navy text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em]">
                  Self-hosted
                </div>
                <div className="text-cp-blue mt-1.5 font-sans text-[15.5px] font-semibold leading-[1.4]">
                  The same engine, deployed in your infrastructure.
                </div>
                <div className="text-cp-muted mt-0.5 font-sans text-[14.5px] leading-[1.4]">
                  Docker, Helm, or bare metal — licensed annually. Talk to us for a quote and an
                  evaluation license.
                </div>
              </div>
              <button
                className="border-cp-blue text-cp-blue hover:border-cp-blue600 hover:text-cp-blue600 flex h-[50px] flex-shrink-0 cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border-2 px-[22px] font-sans text-base font-bold transition-all hover:bg-[rgba(22,119,255,0.08)] max-[720px]:w-full"
                data-testid="pricing-self-hosted-contact-sales"
                onClick={() =>
                  openSalesDialog({
                    placement: 'pricing-self-hosted',
                    productInterest: 'cloudpdf-self-hosted',
                  })
                }
                type="button"
              >
                <span>Talk to us</span>
                <ArrowRight width={20} height={20} />
              </button>
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
