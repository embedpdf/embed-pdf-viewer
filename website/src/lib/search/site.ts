import type { SearchExtractSite } from '@embedpdf/docs-kit/search';

import {
  isDocsIntegration,
  PRODUCT_INTEGRATIONS,
  type IntegrationDocsProduct,
} from '../docs-integrations';
import { resolveDocsTree } from '../docs-markdown';
import { docsProductFromPath } from '../docs-products';

/**
 * This site's binding of the kit search extractor: sections resolve through
 * the SAME markdown pass that renders the `.md` export, so an indexed
 * passage can never claim something the page does not say.
 */
export const searchExtractSite: SearchExtractSite = {
  resolveTree: ({ sourceCode, canonicalPath, integration }) => {
    const reader = integration && isDocsIntegration(integration) ? integration : undefined;
    const { tree } = resolveDocsTree({ sourceCode, canonicalPath, integration: reader });
    return { tree };
  },
  productFromPath: (canonicalPath) => docsProductFromPath(canonicalPath),
  integrationsForProduct: (product) => {
    if (!product || !(product in PRODUCT_INTEGRATIONS)) return [undefined];
    const supported = PRODUCT_INTEGRATIONS[product as IntegrationDocsProduct];
    return supported.length > 0 ? [...supported] : [undefined];
  },
};
