import type { Metadata } from 'next';

import { PricingView } from '@/components/site/pricing-view';
import { loadPublicPlans } from '@/lib/saas-plans';

export const metadata: Metadata = {
  title: 'Pricing — CloudPDF',
  description:
    'Simple, transparent pricing that scales with your product. Start a 14-day free trial on the managed cloud, or talk to us about self-hosting and enterprise plans.',
};

export default async function PricingPage() {
  // Prices, meters, and trial days come from the platform catalog —
  // this page renders facts, it does not own them.
  const plans = await loadPublicPlans();
  return <PricingView plans={plans} />;
}
