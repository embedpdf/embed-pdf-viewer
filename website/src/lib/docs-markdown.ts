import {
  renderDocsMarkdownWith,
  resolveDocsTreeWith,
  stringifyDocsTree,
  type AstNode,
  type DocsMarkdownSite,
} from '@embedpdf/docs-kit';

import { DOCS_SITE } from '../docs-site';

import {
  DOCS_INTEGRATION_LABELS,
  docsIntegrationHref,
  isHeadlessIntegration,
  isDocsIntegration,
  type DocsIntegration,
} from './docs-integrations';
import { docsProductFromPath, type DocsProduct } from './docs-products';
import { collectSampleFiles, readDocsCodeFile } from './docs-samples';
import { SITE_ORIGIN } from './site';

export type { AstNode };

export type RenderDocsMarkdownOptions = {
  sourceCode: string;
  canonicalPath: string;
  integration?: DocsIntegration;
  metadata?: { title?: unknown; description?: unknown };
};

/** This site's binding of the kit's Markdown projection. */
const site: DocsMarkdownSite = {
  siteOrigin: SITE_ORIGIN,
  engine: DOCS_SITE.engine,
  resolveExampleFiles: (name, integration) =>
    integration && isDocsIntegration(integration)
      ? collectSampleFiles(name)[integration]
      : undefined,
  readCodeFile: (codePath) => readDocsCodeFile(codePath),
  isFramework: (value) => isHeadlessIntegration(value),
  variantLabel: (integration) =>
    isDocsIntegration(integration) ? DOCS_INTEGRATION_LABELS[integration] : integration,
  resolveContentHref: (url, integration) =>
    integration && isDocsIntegration(integration) ? docsIntegrationHref(url, integration) : url,
};

/**
 * Resolves raw MDX down to the plain Markdown AST that one concrete route
 * actually shows. The public `.md` projection and the search index both
 * build on this single pass, so an indexed section can never claim
 * something the page does not say.
 */
export function resolveDocsTree({
  sourceCode,
  canonicalPath,
  integration,
}: Omit<RenderDocsMarkdownOptions, 'metadata'>): {
  tree: AstNode;
  product: DocsProduct | null;
} {
  const product = docsProductFromPath(canonicalPath);
  const tree = resolveDocsTreeWith(site, { sourceCode, integration });
  return { tree, product };
}

export { stringifyDocsTree };

/** Produces plain, route-specific Markdown from Nextra's raw MDX source. */
export function renderDocsMarkdown({
  sourceCode,
  canonicalPath,
  integration,
  metadata,
}: RenderDocsMarkdownOptions) {
  const product = docsProductFromPath(canonicalPath);
  return renderDocsMarkdownWith(site, {
    sourceCode,
    canonicalPath,
    integration,
    metadata,
    variantKey: product === 'headless' ? 'framework' : 'integration',
  });
}
