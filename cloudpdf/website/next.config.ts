import type { NextConfig } from 'next';
import nextra from 'nextra';
import { remarkNpm2Yarn } from '@theguild/remark-npm2yarn';
import { visit } from 'unist-util-visit';

import { remarkEngineAxis } from '@embedpdf/docs-kit/mdx';

import { DOCS_SITE } from './src/docs-site';
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

const withNextra = nextra({
  mdxOptions: {
    // Single dark theme so tokens get direct inline colors (matches the
    // CloudPDF design's hand-built code palette).
    rehypePrettyCodeOptions: {
      theme: 'material-theme-palenight',
      keepBackground: false,
    },
    remarkPlugins: [
      // Resolve the engine axis FIRST, so every later plugin (and the
      // compiled page) only ever sees this site's flavour.
      [remarkEngineAxis, { engine: DOCS_SITE.engine }],
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
    rehypePlugins: [rehypeCodeExample],
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The docs kit ships raw TypeScript source (workspace package).
  transpilePackages: ['@embedpdf/docs-kit'],
  async rewrites() {
    // "/docs/…page.md" serves the flavor-resolved Markdown projection.
    return [{ source: '/docs/:path*.md', destination: '/api/docs/markdown/docs/:path*' }];
  },
};

export default withNextra(nextConfig);
