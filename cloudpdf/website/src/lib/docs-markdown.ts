import {
  releasedMarkdownSource,
  renderDocsMarkdownWith,
  resolveDocsTreeWith,
  type AstNode,
  type DocsMarkdownSite,
  type RenderDocsMarkdownOptions,
} from '@embedpdf/docs-kit';

import { DOCS_SITE } from '@/docs-site';

import { projectCloudPdfComponent } from './site-markdown';
import {
  DOCS_INTEGRATION_LABELS,
  docsIntegrationHref,
  fanoutProductFromPath,
  isDocsIntegration,
  isHeadlessIntegration,
} from './docs-integrations';
import { reactVersionHref, type DocsRelease } from './docs-release';
import { collectSampleFiles, readDocsCodeFile } from './docs-samples';

const SITE_ORIGIN = 'https://www.cloudpdf.com';

/**
 * CloudPDF's binding of the kit Markdown projection. The `.md` route passes
 * the integration it resolved from the fan-out URL, so shared pages export
 * exactly what that concrete route renders; the framework-less products
 * (API reference, engine, server) carry no integration and no variant line.
 */
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
  projectComponent: projectCloudPdfComponent,
};

/**
 * The route's Markdown: what its page shows, in full or held back by the publish gate
 * (`release`; without it, in full).
 */
export function renderDocsMarkdown({
  release,
  ...options
}: Omit<RenderDocsMarkdownOptions, 'variantKey'> & { release?: DocsRelease }) {
  const product = fanoutProductFromPath(options.canonicalPath);
  const react = release && reactVersionHref(options.canonicalPath, release);
  return renderDocsMarkdownWith(site, {
    ...options,
    sourceCode: release
      ? releasedMarkdownSource({
          sourceCode: options.sourceCode,
          title: typeof options.metadata?.title === 'string' ? options.metadata.title : undefined,
          framework: isHeadlessIntegration(options.integration) ? options.integration : undefined,
          release,
          reactUrl: react ? `${SITE_ORIGIN}${react}` : null,
        })
      : options.sourceCode,
    variantKey: product === 'headless' ? 'framework' : 'integration',
  });
}

/** The resolved-tree pass the search extractor builds its sections from. */
export function resolveDocsTree({
  sourceCode,
  integration,
}: {
  sourceCode: string;
  integration?: string;
}): { tree: AstNode } {
  return { tree: resolveDocsTreeWith(site, { sourceCode, integration }) };
}
