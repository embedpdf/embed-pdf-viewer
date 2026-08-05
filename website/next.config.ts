import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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

// The docs code panels are inlined at MDX-compile time by remarkCodeExample
// via fs.readFileSync — a read webpack can't see, so a change to a sample
// alone never invalidates the cached compiled MDX (Vercel restores
// .next/cache across deploys, so stale code panels ship while the separately
// built live demos stay fresh). Fix: make the samples a first-class cache
// input by folding a content hash of everything those panels read into
// webpack's persistent cache version. Samples changed → whole cache discarded
// → MDX recompiles and re-reads. Samples untouched → full cache reuse.
function hashDocsCodeInputs(): string {
  const hash = crypto.createHash('sha256');
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        hash.update(abs);
        hash.update(fs.readFileSync(abs));
      }
    }
  };
  // Everything <Example>/<CodeExample> panels read from disk at compile time.
  walk(path.resolve(__dirname, 'src', 'samples'));
  // The demo manifest decides which examples get a live preview; built by
  // build:demos before next build.
  try {
    hash.update(fs.readFileSync(path.resolve(__dirname, 'public', 'demos', 'demos-manifest.json')));
  } catch {
    // No demos built (e.g. bare `next build` in CI checks) — still valid.
  }
  return hash.digest('hex').slice(0, 16);
}

const docsCodeHash = hashDocsCodeInputs();

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
  webpack(config) {
    // See hashDocsCodeInputs above: docs code panels depend on files webpack
    // doesn't track, so their hash versions the persistent cache.
    if (config.cache && typeof config.cache === 'object' && config.cache.type === 'filesystem') {
      config.cache.version = `${config.cache.version ?? ''}|docs-code:${docsCodeHash}`;
    }
    return config;
  },
};

export default withNextra(nextConfig);
