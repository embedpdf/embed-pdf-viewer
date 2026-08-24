/**
 * The SaaS plan catalog, fetched from the control plane. Prices,
 * meters, and trial days are FACTS owned by the platform's catalog —
 * the page never hardcodes a number, so a catalog migration corrects
 * this site on its next render. Copy (taglines, feature labels)
 * remains the page's judgment.
 */

export interface PublicPlanMeter {
  limitValue: string;
  metricCode: 'pdf.uploads' | 'pdf.views' | 'storage.bytes';
  period: string;
}

export interface PublicPlan {
  billingInterval: 'month' | 'year';
  code: string;
  currencyCode: string;
  meters: PublicPlanMeter[];
  name: string;
  tier: string;
  trialDays: number;
  unitAmountMinor: string;
}

/**
 * A rendering-time snapshot of the catalog, used only when the control
 * plane is unreachable at build/revalidate time — the pricing page must
 * never be blank. Mirrors the seeded migrations; if this ever drifts,
 * the live fetch wins everywhere the platform is up.
 */
export const FALLBACK_PLANS: PublicPlan[] = [
  {
    billingInterval: 'month',
    code: 'cloudpdf-saas-standard-monthly',
    currencyCode: 'USD',
    meters: [
      { limitValue: '10000', metricCode: 'pdf.views', period: 'month' },
      { limitValue: '10000', metricCode: 'pdf.uploads', period: 'month' },
      { limitValue: '10737418240', metricCode: 'storage.bytes', period: 'current' },
    ],
    name: 'CloudPDF SaaS Standard',
    tier: 'standard',
    trialDays: 14,
    unitAmountMinor: '19900',
  },
  {
    billingInterval: 'year',
    code: 'cloudpdf-saas-standard-annual',
    currencyCode: 'USD',
    meters: [
      { limitValue: '10000', metricCode: 'pdf.views', period: 'month' },
      { limitValue: '10000', metricCode: 'pdf.uploads', period: 'month' },
      { limitValue: '10737418240', metricCode: 'storage.bytes', period: 'current' },
    ],
    name: 'CloudPDF SaaS Standard Annual',
    tier: 'standard',
    trialDays: 14,
    unitAmountMinor: '198000',
  },
  {
    billingInterval: 'month',
    code: 'cloudpdf-saas-growth-monthly',
    currencyCode: 'USD',
    meters: [
      { limitValue: '50000', metricCode: 'pdf.views', period: 'month' },
      { limitValue: '50000', metricCode: 'pdf.uploads', period: 'month' },
      { limitValue: '53687091200', metricCode: 'storage.bytes', period: 'current' },
    ],
    name: 'CloudPDF SaaS Growth',
    tier: 'growth',
    trialDays: 14,
    unitAmountMinor: '39900',
  },
  {
    billingInterval: 'year',
    code: 'cloudpdf-saas-growth-annual',
    currencyCode: 'USD',
    meters: [
      { limitValue: '50000', metricCode: 'pdf.views', period: 'month' },
      { limitValue: '50000', metricCode: 'pdf.uploads', period: 'month' },
      { limitValue: '53687091200', metricCode: 'storage.bytes', period: 'current' },
    ],
    name: 'CloudPDF SaaS Growth Annual',
    tier: 'growth',
    trialDays: 14,
    unitAmountMinor: '429600',
  },
];

export async function loadPublicPlans(): Promise<PublicPlan[]> {
  const base =
    process.env.CLOUDPDF_PLATFORM_INTERNAL_URL ?? 'http://127.0.0.1:4000';
  try {
    const response = await fetch(`${base}/v1/public/saas-plans`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      return FALLBACK_PLANS;
    }
    const payload = (await response.json()) as { plans?: PublicPlan[] };
    return payload.plans && payload.plans.length > 0
      ? payload.plans
      : FALLBACK_PLANS;
  } catch {
    return FALLBACK_PLANS;
  }
}
