import type { SearchExtractSite } from '@embedpdf/docs-kit/search';

import {
  docsIntegrationHref,
  isDocsIntegration,
  PRODUCT_INTEGRATIONS,
  type DocsIntegration,
  type FanoutDocsProduct,
} from './docs-integrations';
import { resolveDocsTree } from './docs-markdown';

/**
 * CloudPDF's binding of the kit search extractor. Sections resolve through
 * the SAME markdown pass that renders the `.md` export — which is how the
 * API reference gets indexed for free: `<ApiOperation>` pages project their
 * real summaries, parameters, and responses through the same
 * `projectCloudPdfComponent` hook the `.md` route uses.
 */
export const searchExtractSite: SearchExtractSite = {
  resolveTree: ({ sourceCode, integration }) => resolveDocsTree({ sourceCode, integration }),
  productFromPath: (canonicalPath) => canonicalPath.split('/')[2] ?? null,
  integrationsForProduct: (product) => {
    if (product === 'viewer' || product === 'headless') {
      return PRODUCT_INTEGRATIONS[product as FanoutDocsProduct];
    }
    return [undefined];
  },
};

/**
 * Resolves a stored content source to the URL this particular reader should
 * land on: fan-out products get their integration sibling, framework-less
 * products keep their plain route.
 */
export function urlForSection(
  contentPath: string,
  anchor: string | null,
  integration: string | null,
): string {
  const route = `/${contentPath}`;
  const reader: DocsIntegration | null =
    integration && isDocsIntegration(integration) ? integration : null;
  const resolved = reader ? docsIntegrationHref(route, reader) : route;
  return anchor ? `${resolved}#${anchor}` : resolved;
}
