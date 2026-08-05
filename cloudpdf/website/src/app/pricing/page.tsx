import type { Metadata } from 'next';

import { PricingView } from '@/components/site/pricing-view';

export const metadata: Metadata = {
  title: 'Pricing — CloudPDF',
  description:
    'Simple, transparent pricing that scales with your product. Choose managed SaaS or self-hosted, or contact us for enterprise plans.',
};

export default function PricingPage() {
  return <PricingView />;
}
