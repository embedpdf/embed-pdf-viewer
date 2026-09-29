/**
 * Where the docs' old URLs went (Sep 2026 restructures of the engine and
 * headless docs), per engine flavor. Both sites' next.config import this, so a
 * moved page is one edit.
 * Each old path also redirects its Markdown twin (`<path>.md`).
 */
const MOVED = {
  '/docs/engine/core-concepts': '/docs/engine',
  '/docs/engine/core-concepts/engine-and-handles': '/docs/engine/documents/opening',
  '/docs/engine/core-concepts/pages-and-rendering': '/docs/engine/documents/pages',
  '/docs/engine/core-concepts/text': '/docs/engine/text/extraction',
  '/docs/engine/core-concepts/annotations': '/docs/engine/annotations',
  '/docs/engine/core-concepts/annotation-types': '/docs/engine/annotations',
  '/docs/engine/core-concepts/forms': '/docs/engine/forms',
  '/docs/engine/core-concepts/signatures': '/docs/engine/forms/signatures',
  '/docs/engine/core-concepts/metadata': '/docs/engine/documents/metadata',
  '/docs/engine/core-concepts/security-and-access': '/docs/engine/concepts/permissions',
  '/docs/engine/core-concepts/async-and-errors': '/docs/engine/concepts/errors-and-cancelling',
  '/docs/engine/core-concepts/downloading': '/docs/engine/documents/saving',
};

const MOVED_BY_ENGINE = {
  local: {
    '/docs/engine/core-concepts/custom-fonts': '/docs/engine/documents/fonts',
    '/docs/engine/getting-started': '/docs/engine/quick-start',
  },
  cloud: {
    // Fonts on the cloud are the server's configuration.
    '/docs/engine/core-concepts/custom-fonts': '/docs/server/configuration/fonts',
    '/docs/engine/getting-started': '/docs/engine',
    '/docs/engine/getting-started/installation': '/docs/engine/setup',
    '/docs/engine/getting-started/quick-start': '/docs/engine/quick-start',
    '/docs/engine/getting-started/authentication': '/docs/engine/authentication',
  },
};

/**
 * Where the headless docs' old pages went (Sep 2026: from one Plugins section
 * to sections by task), below `/docs/headless/<framework>/`.
 */
const HEADLESS_MOVED = {
  'getting-started': 'quick-start',
  plugins: '',
  'plugins/stage': 'viewing/stage',
  'plugins/render': 'viewing/render',
  'plugins/selection': 'text/selection',
  'plugins/page-edit': 'documents/pages',
  'plugins/stamp': 'annotations/stamps',
  'plugins/signature': 'forms/signatures',
};

const HEADLESS_ROOT = '/docs/headless/:framework(react|vue|svelte|angular)';

/** Next.js `redirects()` entries for the docs on a site of `engine` flavor. */
export function docsRedirects(engine) {
  const moved = { ...MOVED, ...MOVED_BY_ENGINE[engine] };
  for (const [from, to] of Object.entries(HEADLESS_MOVED)) {
    moved[`${HEADLESS_ROOT}/${from}`] = to ? `/docs/headless/:framework/${to}` : '/docs/headless/:framework';
  }
  return Object.entries(moved).flatMap(([source, destination]) => [
    { source, destination, permanent: true },
    { source: `${source}.md`, destination: `${destination}.md`, permanent: true },
  ]);
}
