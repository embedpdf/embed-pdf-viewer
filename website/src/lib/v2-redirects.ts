/**
 * Where the 2.x site's URLs go now that www.embedpdf.com serves the current docs.
 *
 * A 2.x page whose subject has a page here redirects to that page. Everything else in the 2.x URL
 * space (raw PDFium, 2.x-only plugins, the blog) redirects to the same path on the frozen 2.x
 * site, so no old link ends on a 404. The specific entries come first: Next.js takes the first
 * match, and the archive catch-alls close each 2.x section.
 */

export const V2_ARCHIVE_ORIGIN = 'https://v2.embedpdf.com';

type Redirect = { source: string; destination: string; permanent: boolean };

/** The 2.x frameworks with docs of their own; `/docs/snippet` is the 2.x plain-JS viewer. */
const V2_FRAMEWORKS = ['react', 'vue', 'svelte'] as const;

/** `/docs/<fw>/viewer/<page>` and `/docs/snippet/<page>` → a page below `/docs/viewer/<fw>/`. */
const VIEWER = {
  '': '',
  introduction: '',
  'getting-started': 'quick-start',
  'customizing-ui': 'customize/layout',
  engine: 'code/viewer',
  security: 'concepts/security',
  theme: 'customize/theming',
  airgapped: 'self-hosting',
  plugins: 'features',
  'plugins/plugin-annotation': 'features/annotations',
  'plugins/plugin-document-manager': 'documents',
  'plugins/plugin-export': 'documents',
  'plugins/plugin-print': 'documents',
  'plugins/plugin-form': 'features/forms-and-signatures',
  'plugins/plugin-signature': 'features/forms-and-signatures',
  'plugins/plugin-i18n': 'customize/translations',
  'plugins/plugin-pan': 'features',
  'plugins/plugin-rotate': 'features',
  'plugins/plugin-scroll': 'features',
  'plugins/plugin-selection': 'features',
  'plugins/plugin-spread': 'features',
  'plugins/plugin-zoom': 'features',
} as const;

/** `/docs/<fw>/headless/<page>` → a page below `/docs/headless/<fw>/`. */
const HEADLESS = {
  '': '',
  introduction: '',
  'getting-started': 'quick-start',
  engine: 'setup',
  'understanding-plugins': 'concepts/how-it-works',
  security: 'concepts/permissions',
  plugins: '',
  'plugins/plugin-annotation': 'annotations',
  'plugins/plugin-commands': 'ui/commands',
  'plugins/plugin-document-manager': 'documents/opening',
  'plugins/plugin-view-manager': 'documents/tabs',
  'plugins/plugin-export': 'documents/saving',
  'plugins/plugin-print': 'documents/saving',
  'plugins/plugin-form': 'forms',
  'plugins/plugin-i18n': 'ui/translations',
  'plugins/plugin-pan': 'viewing/stage',
  'plugins/plugin-rotate': 'viewing/stage',
  'plugins/plugin-scroll': 'viewing/stage',
  'plugins/plugin-spread': 'viewing/stage',
  'plugins/plugin-thumbnail': 'viewing/stage',
  'plugins/plugin-viewport': 'viewing/stage',
  'plugins/plugin-zoom': 'viewing/stage',
  'plugins/plugin-redaction': 'annotations/redaction',
  'plugins/plugin-render': 'viewing/render',
  'plugins/plugin-tiling': 'viewing/render',
  'plugins/plugin-selection': 'text/selection',
  'plugins/plugin-signature': 'forms/signatures',
  'plugins/plugin-stamp': 'annotations/stamps',
} as const;

/** `/docs/engines/<page>` (the 2.x engine) → a page of today's docs. */
const ENGINES = {
  '': '/docs/engine',
  introduction: '/docs/engine',
  installation: '/docs/engine/setup',
  tasks: '/docs/engine/concepts/errors-and-cancelling',
  'react-integration': '/docs/headless/react/setup',
  'vue-integration': '/docs/headless/vue/setup',
  annotations: '/docs/engine/annotations',
  'annotations/annotation-models': '/docs/engine/annotations',
  'annotations/create-page-annotation': '/docs/engine/annotations',
  'annotations/get-all-annotations': '/docs/engine/annotations',
  'annotations/get-page-annotations': '/docs/engine/annotations',
  'annotations/remove-page-annotation': '/docs/engine/annotations',
  'annotations/update-page-annotation': '/docs/engine/annotations',
  'document-lifecycle': '/docs/engine/documents/opening',
  'document-lifecycle/open-document-buffer': '/docs/engine/documents/opening',
  'document-lifecycle/open-document-url': '/docs/engine/documents/opening',
  'document-lifecycle/close-document': '/docs/engine/documents/opening',
  'document-lifecycle/destroy': '/docs/engine/documents/opening',
  'document-lifecycle/save-as-copy': '/docs/engine/documents/saving',
  rendering: '/docs/engine/documents/rendering',
  'rendering/render-page': '/docs/engine/documents/rendering',
  'rendering/render-page-rect': '/docs/engine/documents/rendering',
  'rendering/render-page-annotation': '/docs/engine/documents/rendering',
} as const;

/** The 2.x site's other pages that have a page here. */
const PAGES = {
  // The 2.x landing per framework chose between the viewer and headless, as the docs home does.
  '/docs/react': '/docs',
  '/docs/vue': '/docs',
  '/docs/svelte': '/docs',
  '/viewer': '/demo',
  '/editor': '/demo',
} as const;

/** 2.x sections with no counterpart, or what's left of one: each goes to the archive whole. */
const ARCHIVED = [
  `/docs/:framework(${V2_FRAMEWORKS.join('|')})/:path*`,
  '/docs/snippet/:path*',
  '/docs/engines/:path*',
  '/docs/pdfium/:path*',
  '/blog/:path*',
  '/enterprise',
  '/layout-analysis',
];

const join = (base: string, page: string) => (page ? `${base}/${page}` : base);

/** The 2.x site's URLs, as Next.js `redirects()` entries for www.embedpdf.com. */
export function v2Redirects(): Redirect[] {
  const moved: [string, string][] = [];
  for (const framework of V2_FRAMEWORKS) {
    for (const [from, to] of Object.entries(VIEWER)) {
      moved.push([join(`/docs/${framework}/viewer`, from), join(`/docs/viewer/${framework}`, to)]);
    }
    for (const [from, to] of Object.entries(HEADLESS)) {
      moved.push([
        join(`/docs/${framework}/headless`, from),
        join(`/docs/headless/${framework}`, to),
      ]);
    }
  }
  for (const [from, to] of Object.entries(VIEWER)) {
    moved.push([join('/docs/snippet', from), join('/docs/viewer/vanilla', to)]);
  }
  for (const [from, to] of Object.entries(ENGINES)) {
    moved.push([join('/docs/engines', from), to]);
  }
  moved.push(...Object.entries(PAGES));

  return [
    ...moved.map(([source, destination]) => ({ source, destination, permanent: true })),
    ...ARCHIVED.map((source) => ({
      source,
      destination: `${V2_ARCHIVE_ORIGIN}${source.replace(/\(.*?\)/, '')}`,
      permanent: true,
    })),
  ];
}
