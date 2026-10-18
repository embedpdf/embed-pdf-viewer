/**
 * The four framework landing pages (/react-pdf-viewer, /vue-pdf-viewer,
 * /svelte-pdf-viewer, /angular-pdf-viewer). Shared here: only the facts each
 * page needs to link and label itself. The copy lives in each page, written
 * for that framework — the pages share a look, never their words.
 */
export type Framework = 'react' | 'vue' | 'svelte' | 'angular';

export const FRAMEWORK_LABEL: Record<Framework, string> = {
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  angular: 'Angular',
};

/** The landing page's own path. */
export const FRAMEWORK_PAGE: Record<Framework, string> = {
  react: '/react-pdf-viewer',
  vue: '/vue-pdf-viewer',
  svelte: '/svelte-pdf-viewer',
  angular: '/angular-pdf-viewer',
};

/** The ready-made viewer's docs for a framework, at a topic. */
export const viewerDocs = (framework: Framework, topic = 'quick-start') =>
  `/docs/viewer/${framework}/${topic}`;

/** The headless docs for a framework, at a topic. */
export const headlessDocs = (framework: Framework, topic = 'quick-start') =>
  `/docs/headless/${framework}/${topic}`;
