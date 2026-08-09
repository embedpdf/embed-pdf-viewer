export default {
  // The marketing homepage (app/page.tsx) shows up as a root "index" page.
  // Hide it so it never leaks into the docs sidebar navigation.
  index: {
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
};
