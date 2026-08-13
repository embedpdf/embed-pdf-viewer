import path from 'node:path';

import { listDocsPages, renderLlmsTxt, type LlmsSection } from '@embedpdf/docs-kit/llms';

import { DEFAULT_PRODUCT_INTEGRATION } from '@/lib/docs-integrations';
import { urlForSection } from '@/lib/search/url';
import { SITE_ORIGIN } from '@/lib/site';

export const dynamic = 'force-static';

/**
 * The site's entry map for AI agents (llmstxt.org): authored framing and
 * section order, generated page inventory. Every link points at the page's
 * `.md` representation — the same projection Copy Page serves — so an agent
 * can go from this file to full, honest page content without scraping HTML.
 */

const SECTIONS: Array<{ label: string; product: string }> = [
  { label: 'Ready-made Viewer', product: 'viewer' },
  { label: 'Headless Components', product: 'headless' },
  { label: 'EmbedPDF Engine', product: 'engine' },
];

function markdownUrl(contentPath: string): string {
  const product = contentPath.split('/')[1];
  const integration =
    product === 'viewer' || product === 'headless' ? DEFAULT_PRODUCT_INTEGRATION[product] : null;
  return `${SITE_ORIGIN}${urlForSection(contentPath, null, integration)}.md`;
}

export function GET() {
  const pages = listDocsPages(path.join(process.cwd(), 'src', 'content'));
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
    title: 'EmbedPDF',
    summary:
      'Open-source JavaScript PDF SDK: a ready-made viewer, headless components for React, Vue, Svelte, and Angular, and the WebAssembly PDF engine underneath. Every link below is a Markdown version of the page.',
    sections,
  });

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
