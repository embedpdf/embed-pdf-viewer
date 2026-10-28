export default {
  // Nextra puts every app-dir page in the root page map, so the marketing
  // pages under app/(site) would leak into the docs sidebar. Hide them.
  index: {
    display: 'hidden',
  },
  'react-pdf-viewer': {
    display: 'hidden',
  },
  'vue-pdf-viewer': {
    display: 'hidden',
  },
  'svelte-pdf-viewer': {
    display: 'hidden',
  },
  'angular-pdf-viewer': {
    display: 'hidden',
  },
  sponsorship: {
    display: 'hidden',
  },
  sponsors: {
    display: 'hidden',
  },
  tools: {
    display: 'hidden',
  },
  docs: {
    title: 'Documentation',
    type: 'page',
  },
  demo: {
    title: 'Demo',
    type: 'page',
  },
};
