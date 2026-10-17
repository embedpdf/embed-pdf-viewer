import {
  releasedMarkdownSource,
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
  isDocsIntegration,
  type DocsIntegration,
} from './docs-integrations';
import { projectEmbedPdfComponent } from './site-markdown';
import { docsProductFromPath, type DocsProduct } from './docs-products';
import { reactVersionHref, type DocsRelease } from './docs-release';
import { collectSampleFiles, readDocsCodeFile } from './docs-samples';
import { SITE_ORIGIN } from './site';

export type { AstNode };

export type RenderDocsMarkdownOptions = {
  sourceCode: string;
  canonicalPath: string;
  integration?: DocsIntegration;
  metadata?: { title?: unknown; description?: unknown };
  /** What the route shows (`./docs-release`). Without it, the page in full. */
  release?: DocsRelease;
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
  isFramework: (value) => isDocsIntegration(value),
  variantLabel: (integration) =>
    isDocsIntegration(integration) ? DOCS_INTEGRATION_LABELS[integration] : integration,
  resolveContentHref: (url, integration) =>
    integration && isDocsIntegration(integration) ? docsIntegrationHref(url, integration) : url,
  projectComponent: projectEmbedPdfComponent,
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
}: Pick<RenderDocsMarkdownOptions, 'sourceCode' | 'canonicalPath' | 'integration'>): {
  tree: AstNode;
  product: DocsProduct | null;
} {
  const product = docsProductFromPath(canonicalPath);
  const tree = resolveDocsTreeWith(site, { sourceCode, integration });
  return { tree, product };
}

export { stringifyDocsTree };

/**
 * Produces plain, route-specific Markdown from Nextra's raw MDX source: what the route's page
 * shows, in full or held back by the publish gate.
 */
export function renderDocsMarkdown({
  sourceCode,
  canonicalPath,
  integration,
  metadata,
  release,
}: RenderDocsMarkdownOptions) {
  const product = docsProductFromPath(canonicalPath);
  const react = release && reactVersionHref(canonicalPath, release);
  return renderDocsMarkdownWith(site, {
    sourceCode: release
      ? releasedMarkdownSource({
          sourceCode,
          title: typeof metadata?.title === 'string' ? metadata.title : undefined,
          framework: isDocsIntegration(integration) ? integration : undefined,
          release,
          reactUrl: react ? `${SITE_ORIGIN}${react}` : null,
        })
      : sourceCode,
    canonicalPath,
    integration,
    metadata,
    variantKey: product === 'headless' ? 'framework' : 'integration',
  });
}
