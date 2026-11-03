export default {
  // Nextra puts every app-dir page in the root page map, so the homepage
  // (app/page.tsx) and the examples gallery would leak into the docs
  // sidebar. Hide them.
  index: {
    display: 'hidden',
  },
  examples: {
    display: 'hidden',
  },
  docs: {
    title: 'Docs',
    type: 'page',
  },
  pricing: {
    title: 'Pricing',
    type: 'page',
  },
  terms: {
    title: 'Terms',
    type: 'page',
  },
  privacy: {
    title: 'Privacy',
    type: 'page',
  },
  contact: {
    title: 'Contact',
    type: 'page',
  },
  'refund-policy': {
    title: 'Refund Policy',
    type: 'page',
  },
};
