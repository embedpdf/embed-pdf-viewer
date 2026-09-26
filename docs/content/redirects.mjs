/**
 * Where the engine docs' old URLs went (Sep 2026 restructure), per engine
 * flavor. Both sites' next.config import this, so a moved page is one edit.
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

/** Next.js `redirects()` entries for the engine docs on a site of `engine` flavor. */
export function engineDocsRedirects(engine) {
  const moved = { ...MOVED, ...MOVED_BY_ENGINE[engine] };
  return Object.entries(moved).flatMap(([source, destination]) => [
    { source, destination, permanent: true },
    { source: `${source}.md`, destination: `${destination}.md`, permanent: true },
  ]);
}
