import path from 'node:path';

import { listDocsPages, renderLlmsTxt, type LlmsSection } from '@embedpdf/docs-kit/llms';

import {
  DEFAULT_PRODUCT_INTEGRATION,
  DOCS_INTEGRATION_LABELS,
  DOCS_INTEGRATIONS,
  PRODUCT_INTEGRATIONS,
  type DocsIntegration,
} from './docs-integrations';
import { docsRelease } from './docs-release';
import { urlForSection } from './search/url';
import { SITE_ORIGIN } from './site';

/**
 * The site's entry maps for AI agents (llmstxt.org): authored framing and
 * section order, generated page inventory. Every link points at the page's
 * `.md` representation — the same projection Copy Page serves — so an agent
 * can go from a file to full, honest page content without scraping HTML.
 *
 * `/llms.txt` lists each page once, in its product's default integration.
 * `/llms/<integration>.txt` lists every page that integration has, so an
 * agent working in Vue reads the Vue pages. Each file links the others.
 */

const SECTIONS: Array<{ label: string; product: string }> = [
  { label: 'Ready-made Viewer', product: 'viewer' },
  { label: 'Headless Components', product: 'headless' },
  { label: 'EmbedPDF Engine', product: 'engine' },
];

const ABOUT =
  'Open-source JavaScript PDF SDK: a ready-made viewer, headless components for React, Vue, Svelte, and Angular, and the WebAssembly PDF engine underneath.';
const LINKS = 'Every link below is a Markdown version of the page.';

/** What a file says it lists: every page for one integration, or each page in its default. */
function framing(only: DocsIntegration | null): { title: string; summary: string } {
  if (!only) return { title: 'EmbedPDF', summary: `${ABOUT} ${LINKS}` };
  const label = DOCS_INTEGRATION_LABELS[only];
  const lists =
    only === 'vanilla'
      ? 'This file lists the documentation for Vanilla JS, a plain HTML page: the viewer and the engine. The headless components need React, Vue, Svelte or Angular.'
      : `This file lists the documentation for ${label}.`;
  return { title: `EmbedPDF for ${label}`, summary: `${ABOUT} ${lists} ${LINKS}` };
}

/** One integration's file, as another file links it. */
function integrationFile(integration: DocsIntegration): LlmsSection['pages'][number] {
  const label = DOCS_INTEGRATION_LABELS[integration];
  return {
    title: label,
    url: `${SITE_ORIGIN}/llms/${integration}.txt`,
    description:
      integration === 'vanilla'
        ? 'The ready-made viewer on a plain HTML page, and the engine.'
        : `The ready-made viewer, the headless components and the engine, for ${label}.`,
  };
}

/**
 * A page's Markdown URL in a file, or null when the file leaves it out: the publish gate holds it
 * back, or its product isn't written for the file's integration (headless has no Vanilla JS).
 */
function markdownUrl(contentPath: string, only: DocsIntegration | null): string | null {
  const product = contentPath.split('/')[1];
  let integration: DocsIntegration | null = null;
  if (product === 'viewer' || product === 'headless') {
    integration = only ?? DEFAULT_PRODUCT_INTEGRATION[product];
    const written = PRODUCT_INTEGRATIONS[product] as readonly DocsIntegration[];
    if (!written.includes(integration)) return null;
  }
  if (!docsRelease(contentPath.split('/'), integration ?? undefined).live) return null;
  return `${SITE_ORIGIN}${urlForSection(contentPath, null, integration)}.md`;
}

/** `/llms.txt` (`only` null), or one integration's `/llms/<integration>.txt`. */
export function renderLlms(only: DocsIntegration | null): string {
  const pages = listDocsPages(path.join(process.cwd(), 'src', 'content')).flatMap((page) => {
    const url = markdownUrl(page.contentPath, only);
    return url ? [{ ...page, url }] : [];
  });
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
      pages: landing ? [{ title: 'Documentation overview', url: landing.url }] : [],
    },
    // The file for everything lists each integration's file first: most readers want one.
    ...(only ? [] : [{ label: 'By framework', pages: DOCS_INTEGRATIONS.map(integrationFile) }]),
    ...SECTIONS.map(({ label, product }) => ({ label, pages: grouped.get(product) ?? [] })),
    { label: 'More', pages: rest },
    ...(only
      ? [
          {
            label: 'Other frameworks',
            pages: DOCS_INTEGRATIONS.filter((other) => other !== only).map(integrationFile),
          },
        ]
      : []),
  ];

  return renderLlmsTxt({
    ...framing(only),
    details: only
      ? []
      : [
          'The viewer and headless pages are written for each framework. This file lists the viewer pages for Vanilla JS and the headless pages for React. The files under "By framework" list every page for one framework.',
        ],
    sections,
  });
}

export function llmsResponse(only: DocsIntegration | null): Response {
  return new Response(renderLlms(only), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
