import type { Metadata } from 'next';

import { SponsorContact } from '@/components/site/sponsorship/contact';
import { SponsorsHero, SponsorWall } from '@/components/site/sponsorship/wall';

export const metadata: Metadata = {
  title: 'Our Sponsors — EmbedPDF',
  description:
    'Meet the companies funding EmbedPDF, the Apache-2.0 open-source PDF viewer and SDK — and find out how to join them.',
};

export default function SponsorsPage() {
  return (
    <main className="bg-ep-bg relative overflow-x-clip">
      <SponsorsHero />
      <SponsorWall />
      <SponsorContact
        title={
          <>
            Put your logo <em className="ep-grad-blue not-italic">next to theirs</em>
          </>
        }
        lede="Join the companies funding open PDF. Pick a tier, or grab 30 minutes with me and we'll find the right fit."
        primary={{ href: '/sponsorship#tiers', label: 'See sponsor tiers' }}
      />
    </main>
  );
}
