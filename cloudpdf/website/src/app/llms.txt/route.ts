import path from 'node:path';

import { listDocsPages, renderLlmsTxt, type LlmsSection } from '@embedpdf/docs-kit/llms';

import { DEFAULT_PRODUCT_INTEGRATION } from '@/lib/docs-integrations';
import { docsRelease } from '@/lib/docs-release';
import { urlForSection } from '@/lib/search-site';

export const dynamic = 'force-static';

const SITE_ORIGIN = 'https://www.cloudpdf.com';

/**
 * The site's entry map for ai agents (llmstxt.org): authored framing and
 * section order, generated page inventory. Every link points at the page's
 * `.md` representation — the same projection Copy Page serves — so an agent
 * can go from this file to full, honest page content (the API reference
 * included) without scraping HTML.
 */

const SECTIONS: Array<{ label: string; product: string }> = [
  { label: 'Ready-made Viewer', product: 'viewer' },
  { label: 'Headless Components', product: 'headless' },
  { label: 'Engine (cloud client)', product: 'engine' },
  { label: 'Self-hosted Server', product: 'server' },
  { label: 'API reference', product: 'api-reference' },
];

function defaultIntegration(contentPath: string) {
  const product = contentPath.split('/')[1];
  return product === 'viewer' || product === 'headless'
    ? DEFAULT_PRODUCT_INTEGRATION[product]
    : null;
}

function markdownUrl(contentPath: string): string {
  return `${SITE_ORIGIN}${urlForSection(contentPath, null, defaultIntegration(contentPath))}.md`;
}

export function GET() {
  // Each page is listed in its default framework; one the publish gate holds back isn't listed.
  const pages = listDocsPages(path.join(process.cwd(), 'src', 'content')).filter(
    (page) =>
      docsRelease(page.contentPath.split('/'), defaultIntegration(page.contentPath) ?? undefined)
        .live,
  );
  const grouped = new Map(SECTIONS.map((section) => [section.product, [] as typeof pages]));
  const rest: typeof pages = [];
  let landing: (typeof pages)[number] | undefined;

  for (const page of pages) {
    if (page.contentPath === 'docs') {
      landing = page;
      continue;
    }
    const product = page.contentPath.split('/')[1];
    (grouped.get(product) ?? rest).push(page);
  }

  const sections: LlmsSection[] = [
    {
      label: 'Start here',
      pages: landing
        ? [{ title: 'Documentation overview', url: markdownUrl(landing.contentPath) }]
        : [],
    },
    ...SECTIONS.map(({ label, product }) => ({
      label,
      pages: (grouped.get(product) ?? []).map((page) => ({
        title: page.title,
        description: page.description,
        url: markdownUrl(page.contentPath),
      })),
    })),
    {
      label: 'More',
      pages: rest.map((page) => ({
        title: page.title,
        description: page.description,
        url: markdownUrl(page.contentPath),
      })),
    },
  ];

  const body = renderLlmsTxt({
    title: 'CloudPDF',
    summary:
      'Production-grade PDF for your product: a ready-made viewer, headless components for React, Vue, Svelte, and Angular, and a cloud PDF engine — managed SaaS or self-hosted — with a full REST API and official SDKs. Every link below is a Markdown version of the page.',
    sections,
  });

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
