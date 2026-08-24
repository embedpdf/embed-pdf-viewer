import {
  createDocsOgResponse,
  selectOgSnippet,
  snippetFromFrontmatter,
  type OgSnippet,
} from '@embedpdf/docs-kit/og';
import { importPage } from 'nextra/pages';

import { DOCS_INTEGRATION_LABELS, isDocsIntegration } from './docs-integrations';
import { apiOperationSnippet } from './og-api-snippet';
import { resolveDocsTree } from './docs-markdown';
import { resolveDocsPath } from './docs-route';
import { ogBrand } from './og-brand';

/**
 * This site's binding of the kit's social card.
 *
 * The snippet comes from the SAME markdown pass that renders the `.md`
 * export and feeds the search index, so a card cannot advertise code the
 * page does not show — and the API reference gets real per-SDK snippets for
 * free, because `<ApiOperation>` projects them through that pass already.
 */
const SECTION_LABELS: Record<string, string> = {
  viewer: 'PDF Viewer',
  headless: 'Headless SDK',
  engine: 'PDF Engine',
  server: 'Server',
  'api-reference': 'API Reference',
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
};

const DEFAULT_DESCRIPTION = 'Build production-ready PDF experiences with CloudPDF.';

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function titleFromPath(mdxPath: string[]) {
  const slug = mdxPath.at(-1) ?? 'Documentation';
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** `/docs/<product>/…` names the section; everything else is plain docs. */
export function sectionLabel(mdxPath: string[]) {
  return SECTION_LABELS[mdxPath[1] ?? ''] ?? 'Documentation';
}

/** The social image URL a page's `<meta>` tags point at. */
export function socialImagePath(mdxPath: string[]) {
  return `/api/og/${mdxPath.join('/')}`;
}

async function resolveSnippet(
  mdxPath: string[],
  metadata: Record<string, unknown> | undefined,
  sourceCode: string,
  integration: string | undefined,
): Promise<OgSnippet | null> {
  const basename = mdxPath.at(-1) ?? 'example';

  // An author's choice wins; then the API reference's own rung, which knows
  // where an operation page's prelude ends; then the generic first-block-that-
  // fits pass. See ./og-api-snippet.ts for why the middle rung exists.
  const authored = snippetFromFrontmatter(metadata?.ogSnippet, basename);
  if (authored) return authored;

  const operation = apiOperationSnippet(sourceCode, basename);
  if (operation) return operation;

  const { tree } = resolveDocsTree({ sourceCode, integration });
  return selectOgSnippet(tree, basename);
}

/** Renders the social card for a documentation URL. */
export async function createDocsSocialImage(mdxPath: string[]) {
  const resolved = resolveDocsPath(mdxPath);
  if (!resolved) throw new Error(`Cannot create a social image for /${mdxPath.join('/')}.`);

  const { metadata, sourceCode } = await importPage(resolved.contentPath);
  const frontmatter = (metadata ?? {}) as Record<string, unknown>;
  const integration = resolved.integration;

  return createDocsOgResponse(ogBrand, {
    canonicalPath: `/${mdxPath.join('/')}`,
    description:
      text(frontmatter.ogDescription) ?? text(frontmatter.description) ?? DEFAULT_DESCRIPTION,
    integration,
    integrationLabel:
      integration && isDocsIntegration(integration)
        ? DOCS_INTEGRATION_LABELS[integration]
        : undefined,
    section: sectionLabel(mdxPath),
    snippet: await resolveSnippet(mdxPath, frontmatter, sourceCode, integration),
    title: text(frontmatter.ogTitle) ?? text(frontmatter.title) ?? titleFromPath(mdxPath),
  });
}
