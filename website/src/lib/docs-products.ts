import {
  docsIntegrationHref,
  integrationForProduct,
  type DocsIntegration,
} from './docs-integrations';

export const DOCS_PRODUCTS = {
  viewer: {
    label: 'Viewer',
    href: '/docs/viewer/getting-started',
  },
  headless: {
    label: 'Headless',
    href: '/docs/headless/getting-started',
  },
  engine: {
    label: 'Engine',
    href: '/docs/engine',
  },
} as const;

export type DocsProduct = keyof typeof DOCS_PRODUCTS;

export function docsProductFromPath(pathname: string): DocsProduct | null {
  const product = pathname.split('/')[2];
  return product && product in DOCS_PRODUCTS ? (product as DocsProduct) : null;
}

/**
 * Carries the current integration between products. With no URL integration
 * (for example on Engine), the variant-less courtesy route lets middleware
 * recover the persisted preference.
 */
export function docsProductHref(
  product: DocsProduct,
  currentIntegration: DocsIntegration | null,
): string {
  const route = DOCS_PRODUCTS[product].href;
  if (product === 'engine' || !currentIntegration) return route;

  return docsIntegrationHref(route, integrationForProduct(product, currentIntegration));
}
