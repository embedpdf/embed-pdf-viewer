import type { Metadata } from 'next';

import { SponsorContact } from '@/components/site/sponsorship/contact';
import { CostOfABlackBox } from '@/components/site/sponsorship/cost';
import { SponsorFaq } from '@/components/site/sponsorship/faq';
import { FundingGoal } from '@/components/site/sponsorship/funding';
import { SponsorshipHero } from '@/components/site/sponsorship/hero';
import { FounderLetter } from '@/components/site/sponsorship/letter';
import { AlreadyShipped } from '@/components/site/sponsorship/shipped';
import { SponsorTiers } from '@/components/site/sponsorship/tiers';

export const metadata: Metadata = {
  title: 'Sponsor EmbedPDF | Fund the Open-Source PDF SDK',
  description:
    'Help fund the Apache-2.0 PDF SDK that breaks the cycle of expensive vendor lock-in. Sponsor EmbedPDF development, steer the roadmap, and own your PDF technology.',
};

/**
 * The case for sponsoring, read top to bottom: the ask, the founder's story,
 * the problem, the proof, where the money goes, the tiers, the doubts, and
 * the person to talk to. /sponsors is the thank-you wall that follows it.
 */
export default function SponsorshipPage() {
  return (
    <main className="bg-ep-bg relative overflow-x-clip">
      <SponsorshipHero />
      <FounderLetter />
      <CostOfABlackBox />
      <AlreadyShipped />
      <FundingGoal />
      <SponsorTiers />
      <SponsorFaq />
      <SponsorContact
        title={
          <>
            Ready to own your <em className="ep-grad-blue not-italic">PDF technology</em>?
          </>
        }
        lede="Let's have a real conversation about breaking free from vendor lock-in. I personally respond to every message."
      />
    </main>
  );
}
