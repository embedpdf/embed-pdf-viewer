/**
 * Who writes each published package's README (`scripts/readmes.mjs`;
 * docs/conventions/docs-architecture.md, "Package READMEs"). Every published package is here,
 * but a plugin (`packages/plugin/<name>`), whose pages `reference.mjs` lists for its capability:
 * a plugin has an entry only to show a `section` of its page in place of the page's opening.
 *
 * - **`page`**: a package the docs tell you to install. Its README is cut from that page, under
 *   `docs/content` and as its sidebar routes it (`headless/quick-start`). `framework` is the
 *   framework the page is shown for: one of the four on a headless page, those or `vanilla` on a
 *   viewer page, none on an engine page. `section` names a `##` section of the page by its
 *   heading; the README then shows that section, under that heading, in place of the page's
 *   opening under the page's title. `also` names a
 *   second page, `{ page, section }`, shown after the cut under its own heading: that section,
 *   or the page's opening under the page's title. It is what the package has: every plugin, or
 *   every feature of the viewer.
 * - **`near`**: a package that only comes along with others. Its README says which, and links
 *   the page nearest to what the package does.
 * - **`by`**: this script doesn't write the README. `'hand'` is one still written by hand, with
 *   `installed` when the docs tell you to install the package, so a README can say it brings
 *   another along. `'api:sync'` is the SDK's, which Fern writes from the API contract.
 *
 * An `@embedpdf/*` package gets embedpdf.com's form of a page and its code, a `@cloudpdf/*`
 * package cloudpdf.com's.
 */
const EVERY_PLUGIN = { page: 'headless/index', section: 'Every plugin' };
const ALL_FEATURES = { page: 'viewer/features/index' };
const viewer = (framework) => ({ page: 'viewer/quick-start', framework, also: ALL_FEATURES });
const ENGINE_SETUP = { near: 'engine/setup' };
const BY_HAND = { by: 'hand' };
const INSTALLED_BY_HAND = { by: 'hand', installed: true };

export const READMES = {
  // ── packages/framework ──
  '@embedpdf/react': { page: 'headless/quick-start', framework: 'react', also: EVERY_PLUGIN },
  '@embedpdf/vue': { page: 'headless/quick-start', framework: 'vue', also: EVERY_PLUGIN },
  '@embedpdf/svelte': { page: 'headless/quick-start', framework: 'svelte', also: EVERY_PLUGIN },
  '@embedpdf/angular': { page: 'headless/quick-start', framework: 'angular', also: EVERY_PLUGIN },
  '@embedpdf/web': { near: 'headless/index' },

  // ── packages/core ──
  '@embedpdf/core': { near: 'headless/concepts/how-it-works' },
  '@embedpdf/core-acrojs': { near: 'headless/documents/actions' },
  '@embedpdf/core-annotation': BY_HAND,
  '@embedpdf/core-fonts': { near: 'engine/documents/fonts' },
  '@embedpdf/core-form': { near: 'headless/forms/index' },
  '@embedpdf/core-geometry': { near: 'headless/concepts/coordinates' },
  '@embedpdf/core-js-sandbox': { near: 'headless/documents/actions' },
  '@embedpdf/core-signature': { page: 'engine/forms/signatures' },
  '@embedpdf/core-stage': { near: 'headless/viewing/stage' },
  '@embedpdf/core-text': { near: 'headless/documents/fonts' },
  '@embedpdf/core-ui': { near: 'headless/ui/toolbar' },

  // ── packages/plugin ──
  // Its page opens on the tabs every viewer has; the plugin is the panes, further down.
  '@embedpdf/plugin-view-manager': { section: 'Side by side' },
  '@embedpdf/plugin-annotation': BY_HAND,
  '@embedpdf/plugin-history': BY_HAND,
  '@embedpdf/plugin-measurement': BY_HAND,
  '@embedpdf/plugin-redaction': BY_HAND,
  '@embedpdf/plugin-signature': BY_HAND,
  '@embedpdf/plugin-stage': BY_HAND,

  // ── packages/viewer ──
  '@embedpdf/viewer': viewer('vanilla'),
  '@embedpdf/viewer-react': viewer('react'),
  '@embedpdf/viewer-vue': viewer('vue'),
  '@embedpdf/viewer-svelte': viewer('svelte'),
  '@embedpdf/viewer-angular': viewer('angular'),
  '@embedpdf/viewer-chrome': { near: 'viewer/index' },

  // ── packages/engine, and the font and stamp packages ──
  '@embedpdf/engine': {
    page: 'engine/quick-start',
    also: { page: 'engine/index', section: 'What you can do' },
  },
  '@embedpdf/engine-core': ENGINE_SETUP,
  '@embedpdf/engine-services': ENGINE_SETUP,
  '@embedpdf/engine-runtime': ENGINE_SETUP,
  '@embedpdf/engine-runtime-darwin-arm64': ENGINE_SETUP,
  '@embedpdf/engine-runtime-darwin-x64': ENGINE_SETUP,
  '@embedpdf/engine-runtime-linux-arm64': ENGINE_SETUP,
  '@embedpdf/engine-runtime-linux-x64': ENGINE_SETUP,
  '@embedpdf/engine-runtime-linuxmusl-arm64': ENGINE_SETUP,
  '@embedpdf/engine-runtime-linuxmusl-x64': ENGINE_SETUP,
  // The page that says where its file goes when you serve it yourself.
  '@embedpdf/engine-runtime-wasm32': { near: 'viewer/self-hosting' },
  '@embedpdf/engine-runtime-win32-arm64': ENGINE_SETUP,
  '@embedpdf/engine-runtime-win32-x64': ENGINE_SETUP,
  '@embedpdf/default-fallback-fonts': { near: 'engine/documents/fonts' },
  '@embedpdf/default-signature-fonts': {
    page: 'headless/annotations/stamps',
    framework: 'react',
    section: 'Handwriting fonts for typed marks',
  },
  '@embedpdf/default-stamps': INSTALLED_BY_HAND,

  // ── cloudpdf ──
  '@cloudpdf/viewer': viewer('vanilla'),
  '@cloudpdf/viewer-react': viewer('react'),
  '@cloudpdf/viewer-vue': viewer('vue'),
  '@cloudpdf/viewer-svelte': viewer('svelte'),
  '@cloudpdf/viewer-angular': viewer('angular'),
  '@cloudpdf/engine': INSTALLED_BY_HAND,
  '@cloudpdf/plugin-protected-display': INSTALLED_BY_HAND,
  '@cloudpdf/web': INSTALLED_BY_HAND,
  '@cloudpdf/server': INSTALLED_BY_HAND,
  '@cloudpdf/server-modules': INSTALLED_BY_HAND,
  '@cloudpdf/contract': BY_HAND,
  '@cloudpdf/sdk': { by: 'api:sync' },
};
