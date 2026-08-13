import {
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
import { collectSampleFiles, readDocsCodeFile } from './docs-samples';

/**
 * CloudPDF's binding of the kit Markdown projection. The `.md` route passes
 * the integration it resolved from the fan-out URL, so shared pages export
 * exactly what that concrete route renders; the framework-less products
 * (API reference, engine, server) carry no integration and no variant line.
 */
const site: DocsMarkdownSite = {
  siteOrigin: 'https://www.cloudpdf.com',
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

export function renderDocsMarkdown(options: Omit<RenderDocsMarkdownOptions, 'variantKey'>) {
  const product = fanoutProductFromPath(options.canonicalPath);
  return renderDocsMarkdownWith(site, {
    ...options,
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
