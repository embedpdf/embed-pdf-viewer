import fs from 'node:fs';
import path from 'node:path';

import { listDocsPages } from '@embedpdf/docs-kit/llms';
import { expect, it } from 'vitest';

import { PRODUCT_INTEGRATIONS, type DocsIntegration } from './docs-integrations';
import { renderDocsMarkdown } from './docs-markdown';
import { urlForSection } from './search/url';

/**
 * The links of the Markdown export (`./docs-markdown`), on every page, for every integration.
 * Markdown is read away from its page, so each link is a full URL, and a link to a docs page
 * names a page embedpdf.com or cloudpdf.com has, by its `.md`.
 */

const SITES = {
  'https://www.embedpdf.com': path.resolve(process.cwd(), 'src/content'),
  'https://www.cloudpdf.com': path.resolve(process.cwd(), '../cloudpdf/website/src/content'),
};

const integrationsOf = (contentPath: string): readonly (DocsIntegration | undefined)[] => {
  const product = contentPath.split('/')[1];
  return product === 'viewer' || product === 'headless'
    ? PRODUCT_INTEGRATIONS[product]
    : [undefined];
};

/** Every docs URL a site answers: each page for each integration, and its door without one. */
function routesOf(contentRoot: string): Set<string> {
  const routes = new Set<string>();
  for (const { contentPath } of listDocsPages(contentRoot)) {
    routes.add(`/${contentPath}`);
    for (const integration of integrationsOf(contentPath)) {
      routes.add(urlForSection(contentPath, null, integration ?? null));
    }
  }
  return routes;
}

function sourceOf(contentRoot: string, contentPath: string): string {
  const page = path.join(contentRoot, contentPath);
  const file = fs.existsSync(`${page}.mdx`) ? `${page}.mdx` : path.join(page, 'index.mdx');
  return fs.readFileSync(file, 'utf8');
}

/** What a page links, outside its code. */
function linksOf(markdown: string): string[] {
  const prose = markdown.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
}

it(
  'gives every link a full URL, and every docs link a page’s Markdown',
  { timeout: 120_000 },
  () => {
    const [origin, contentRoot] = Object.entries(SITES)[0];
    const routes = new Map(Object.entries(SITES).map(([site, root]) => [site, routesOf(root)]));
    const problems: string[] = [];
    let docsLinks = 0;

    for (const { contentPath } of listDocsPages(contentRoot)) {
      for (const integration of integrationsOf(contentPath)) {
        const canonicalPath = urlForSection(contentPath, null, integration ?? null);
        const markdown = renderDocsMarkdown({
          sourceCode: sourceOf(contentRoot, contentPath),
          canonicalPath,
          integration,
        });

        for (const link of linksOf(markdown)) {
          if (link.startsWith('#') || link.startsWith('mailto:')) continue;
          if (!URL.canParse(link)) {
            problems.push(`${canonicalPath}: ${link} is not a full URL`);
            continue;
          }
          const url = new URL(link);
          const pages = routes.get(url.origin);
          if (!pages || !/^\/docs(\/|\.md$|$)/.test(url.pathname)) continue;
          const [, extension] = url.pathname.match(/\.([a-z0-9]+)$/i) ?? [];
          // A file a site serves under `/docs`, such as a screenshot.
          if (extension && extension !== 'md') continue;
          docsLinks += 1;
          if (!extension) {
            problems.push(`${canonicalPath}: ${link} is a docs page, not its Markdown`);
          } else if (!pages.has(url.pathname.slice(0, -'.md'.length))) {
            problems.push(`${canonicalPath}: ${link} is no page`);
          }
        }
      }
    }

    expect(origin).toBe('https://www.embedpdf.com');
    expect(problems).toEqual([]);
    // The check reads links: a few thousand of them, or it stopped finding any.
    expect(docsLinks).toBeGreaterThan(1000);
  },
);
