import type { NextConfig } from 'next';
import nextra from 'nextra';
import { remarkNpm2Yarn } from '@theguild/remark-npm2yarn';
import { visit } from 'unist-util-visit';

import { rehypeCodeExample } from './src/lib/rehype-code-example';
import { remarkCodeExample } from './src/lib/remark-code-example';

// Nextra 4 emits the Tabs import from `nextra/components` for npm2yarn blocks
// regardless of the plugin's `packageName` option, so rewrite the import
// source to the branded EmbedPDF Tabs.
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

// GitHub "view source" base for docs samples. Derived from Vercel's git
// system env vars (same convention as the commit-SHA reads in mdx.tsx /
// docs-feedback-store.ts) so every deployment — production and a preview of
// any branch — links to the exact ref it was built from; there's no `next`→
// `main` flip to remember at launch. Falls back to the repo default for
// local / non-Vercel builds.
const githubOwner = process.env.VERCEL_GIT_REPO_OWNER ?? 'embedpdf';
const githubRepo = process.env.VERCEL_GIT_REPO_SLUG ?? 'embed-pdf-viewer';
const githubRef = process.env.VERCEL_GIT_COMMIT_REF ?? process.env.GIT_COMMIT_REF ?? 'main';
// The website lives at <repo>/website/; sample paths resolve relative to it.
const githubBaseUrl = `https://github.com/${githubOwner}/${githubRepo}/blob/${githubRef}/website/`;

const withNextra = nextra({
  mdxOptions: {
    rehypePrettyCodeOptions: {
      theme: 'material-theme-palenight',
      keepBackground: false,
    },
    remarkPlugins: [
      [
        remarkNpm2Yarn,
        {
          packageName: '@/components/docs/tabs',
          tabNamesProp: 'items',
          storageKey: 'selectedPackageManager',
        },
      ],
      overrideNpm2YarnImports,
      [remarkCodeExample, { githubBaseUrl }],
    ],
    rehypePlugins: [rehypeCodeExample],
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withNextra(nextConfig);
