/**
 * Everything the two sponsorship pages say that changes over time, in one
 * place: who sponsors, what the tiers cost, how far the monthly goal is.
 * The components only lay it out — adding a sponsor or moving the funding
 * bar is an edit here and nowhere else.
 */

export type TierId = 'gold' | 'silver' | 'bronze';

export type Sponsor = {
  name: string;
  /** Square logo under /public/sponsors — rendered as a rounded app tile. */
  logo: string;
  url: string;
  tier: TierId;
  description?: string;
};

export const SPONSORS: Sponsor[] = [
  {
    name: 'With Love Internet',
    logo: '/sponsors/sponsor-wli.png',
    url: 'https://www.withloveinternet.com?utm_source=embedpdf&utm_campaign=oss',
    tier: 'silver',
    description: 'The digital agency for growth-oriented companies.',
  },
  {
    name: 'Align',
    logo: '/sponsors/sponsor-align.jpeg',
    url: 'https://align.lawyer?utm_source=embedpdf&utm_campaign=oss',
    tier: 'silver',
    description: 'Tools for litigators, built by litigators.',
  },
  {
    name: 'Accrual',
    logo: '/sponsors/sponsor-accrual.jpg',
    url: 'https://www.accrual.com?utm_source=embedpdf&utm_campaign=oss',
    tier: 'bronze',
  },
  {
    name: 'Layer',
    logo: '/sponsors/sponsor-layer.png',
    url: 'https://layer.team/?utm_source=embedpdf&utm_campaign=oss',
    tier: 'bronze',
  },
  {
    name: 'Lefebvre',
    logo: '/sponsors/sponsor-lefebvre.png',
    url: 'https://www.lefebvre-group.com?utm_source=embedpdf&utm_campaign=oss',
    tier: 'bronze',
  },
  {
    name: 'forml',
    logo: '/sponsors/sponsor-forml.png',
    url: 'https://forml.eu?utm_source=embedpdf&utm_campaign=oss',
    tier: 'bronze',
  },
  {
    name: 'Hive',
    logo: '/sponsors/sponsor-hive.png',
    url: 'https://hive.com/?utm_source=embedpdf&utm_campaign=oss',
    tier: 'bronze',
  },
];

export function sponsorsIn(tier: TierId) {
  return SPONSORS.filter((s) => s.tier === tier);
}

export type Tier = {
  id: TierId;
  name: string;
  price: string;
  tagline: string;
  perks: string[];
  cta: string;
  featured?: boolean;
};

export const TIERS: Tier[] = [
  {
    id: 'bronze',
    name: 'Bronze',
    price: '$500–1,500',
    tagline: 'Put your name behind open PDF.',
    perks: [
      'Logo on the website and README',
      'Monthly roadmap calls',
      'Private Discord channel',
      'Priority GitHub support',
    ],
    cta: 'Become a Bronze sponsor',
  },
  {
    id: 'silver',
    name: 'Silver',
    price: '$2,500',
    tagline: 'A real say in what ships next.',
    perks: [
      'Everything in Bronze',
      'Prominent logo placement',
      'Bi-weekly calls with the founder',
      'Priority on feature requests',
      'Hands-on integration support',
    ],
    cta: 'Become a Silver sponsor',
    featured: true,
  },
  {
    id: 'gold',
    name: 'Gold',
    price: '$5,000+',
    tagline: 'The team, building for you.',
    perks: [
      'Everything in Silver',
      'Weekly direct access to the team',
      'Custom feature development',
      'Migration consulting',
      'Co-marketing',
    ],
    cta: 'Talk to us about Gold',
  },
];

/**
 * The monthly goal and where it stands. `raised` is set by hand when a
 * sponsorship starts or ends; the milestones are what each step pays for.
 */
export const FUNDING = {
  raised: 8500,
  goal: 30000,
  milestones: [
    { at: 15000, label: 'Full-time lead developer' },
    { at: 30000, label: 'Senior mobile developer' },
  ],
};

export const FOUNDING_SEATS = 10;

export const CONTACT = {
  email: 'bob.singor@embedpdf.com',
  call: 'https://cal.com/embedpdf/30min',
  discord: 'https://discord.com/invite/mHHABmmuVU',
  githubSponsors: 'https://github.com/sponsors/embedpdf',
  linkedin: 'https://linkedin.com/in/bobsingor',
  x: 'https://x.com/bobsingor',
};

export function mailto(subject: string) {
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}`;
}

export function usd(amount: number) {
  return `$${amount.toLocaleString('en-US')}`;
}
