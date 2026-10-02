import type { NextConfig } from 'next';
import nextra from 'nextra';
import { remarkNpm2Yarn } from '@theguild/remark-npm2yarn';
import { visit } from 'unist-util-visit';

import { remarkEngineAxis } from '@embedpdf/docs-kit/mdx';
import {
  CODE_PANELS_DIR,
  openCodePanels,
  withCodePanelsCache,
} from '@embedpdf/docs-kit/mdx/code-panels';
import { remarkFrameworkNames } from '@embedpdf/docs-kit/mdx/frameworks';
import { remarkInstallChannel } from '@embedpdf/docs-kit/mdx/install-channel';

import { DOCS_SITE } from './src/docs-site';
import { docsRedirects } from '../../docs/content/redirects.mjs';
import { rehypeCodeExample } from './src/lib/rehype-code-example';
import { remarkCodeExample } from './src/lib/remark-code-example';

// Nextra 4 emits the Tabs import from `nextra/components` for npm2yarn blocks
// regardless of the plugin's `packageName` option, so rewrite the import source
// to our branded CloudPDF Tabs.
const overrideNpm2YarnImports = () => (tree: any) => {
  visit(tree, 'mdxjsEsm', (node: any) => {
    const body = node.data?.estree?.body;
    if (!body) return;
    for (const statement of body) {
      if (
        statement.type === 'ImportDeclaration' &&
        statement.source.value === 'nextra/components'
      ) {
        statement.source.value = '@/components/docs/tabs';
        statement.source.raw = "'@/components/docs/tabs'";
      }
    }
  });
  return tree;
};

// The code of every <Example>/<Snippet> is read from src/samples at MDX-compile time
// (remarkCodeExample, via fs.readFileSync — a read webpack can't see) and stored outside the
// compiled page (rehypeCodeExample → docs-kit `mdx/code-panels`, in .next/cache/docs-code). So a
// change to a sample alone would never invalidate the cached compiled MDX (Vercel restores
// .next/cache across deploys). `openCodePanels` hashes everything the panels are made from — the
// samples, and the demo manifest that decides which examples get a live preview — and its
// `cacheVersion` versions webpack's persistent cache: samples changed → whole cache discarded →
// MDX recompiles and re-reads. Samples untouched → full cache reuse, and the store still holds
// every file the cached pages point at.
const codePanels = openCodePanels({
  siteRoot: __dirname,
  inputs: ['src/samples', 'public/demos/demos-manifest.json'],
});

const withNextra = nextra({
  mdxOptions: {
    // Single dark theme so tokens get direct inline colors (matches the
    // CloudPDF design's hand-built code palette).
    rehypePrettyCodeOptions: {
      theme: 'material-theme-palenight',
      keepBackground: false,
    },
    remarkPlugins: [
      // Resolve the engine axis first, so every later plugin (and the
      // compiled page) only ever sees this site's flavour.
      [remarkEngineAxis, { engine: DOCS_SITE.engine }],
      // Headless pages show each framework's names (`useSearch()` → `inject(EpdfSearch)`).
      remarkFrameworkNames,
      // Stamp the release channel on install commands before npm2yarn fans
      // the npm line out, so every package-manager tab inherits the tag.
      remarkInstallChannel,
      [
        remarkNpm2Yarn,
        {
          packageName: '@/components/docs/tabs',
          tabNamesProp: 'items',
          storageKey: 'selectedPackageManager',
        },
      ],
      overrideNpm2YarnImports,
      remarkCodeExample,
    ],
    rehypePlugins: [[rehypeCodeExample, { panelsDir: codePanels.dir }]],
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The docs pages that moved (docs/content/redirects.mjs).
  async redirects() {
    return docsRedirects(DOCS_SITE.engine);
  },
  // The docs kit ships raw TypeScript source (workspace package).
  transpilePackages: ['@embedpdf/docs-kit'],
  // "/docs/…/<page>.md" is rewritten to the Markdown Route Handler by
  // middleware.ts, which also owns the fan-out courtesy redirects.
  // The search route reads the per-deploy artifact from the filesystem;
  // tracing must bundle it into the serverless function. The docs pages read
  // their code panels from the store at render (RouteExample): the build
  // prerenders them, and a page rendered on request needs the store too. (The
  // key is a glob, so the brackets of `[...mdxPath]` are escaped.)
  outputFileTracingIncludes: {
    '/api/search': ['./public/search-index.bin'],
    '/\\[...mdxPath\\]': [`./${CODE_PANELS_DIR}/**/*.json`],
  },
  webpack(config) {
    // See openCodePanels above: docs code panels depend on files webpack
    // doesn't track, so their hash versions the persistent cache.
    return withCodePanelsCache(config, codePanels);
  },
};

export default withNextra(nextConfig);
