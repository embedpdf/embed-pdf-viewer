/**
 * The shared integration preference across the Viewer and Headless docs.
 *
 * The URL remains the source of truth for the current page. The cookie only
 * chooses an integration when a visitor enters through a variant-less route.
 */
export const DOCS_INTEGRATIONS = ['vanilla', 'react', 'vue', 'svelte', 'angular'] as const;
export type DocsIntegration = (typeof DOCS_INTEGRATIONS)[number];

export const HEADLESS_INTEGRATIONS = ['react', 'vue', 'svelte', 'angular'] as const;
export type HeadlessIntegration = (typeof HEADLESS_INTEGRATIONS)[number];

export type IntegrationDocsProduct = 'viewer' | 'headless' | 'engine';

export const INTEGRATION_COOKIE = 'epdf-integration';

export const DOCS_INTEGRATION_LABELS: Record<DocsIntegration, string> = {
  vanilla: 'Vanilla JS',
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  angular: 'Angular',
};

export const PRODUCT_INTEGRATIONS = {
  viewer: DOCS_INTEGRATIONS,
  headless: HEADLESS_INTEGRATIONS,
  engine: [],
} as const satisfies Record<IntegrationDocsProduct, readonly DocsIntegration[]>;

export const DEFAULT_PRODUCT_INTEGRATION = {
  viewer: 'vanilla',
  headless: 'react',
} as const satisfies Record<Exclude<IntegrationDocsProduct, 'engine'>, DocsIntegration>;

export function isDocsIntegration(value: string | undefined): value is DocsIntegration {
  return DOCS_INTEGRATIONS.includes(value as DocsIntegration);
}

export function isHeadlessIntegration(value: string | undefined): value is HeadlessIntegration {
  return HEADLESS_INTEGRATIONS.includes(value as HeadlessIntegration);
}

/** Reads the integration only from a concrete Viewer or Headless URL. */
export function docsIntegrationFromPath(pathname: string): DocsIntegration | null {
  const segments = pathname.split('/');
  const product = segments[2];
  const integration = segments[3];

  if (product === 'viewer' && isDocsIntegration(integration)) return integration;
  if (product === 'headless' && isHeadlessIntegration(integration)) return integration;
  return null;
}

/** Reads a concrete Headless integration and excludes Viewer routes. */
export function headlessIntegrationFromPath(pathname: string): HeadlessIntegration | null {
  const integration = docsIntegrationFromPath(pathname);
  return pathname.split('/')[2] === 'headless' && integration && isHeadlessIntegration(integration)
    ? integration
    : null;
}

/**
 * Resolves a shared preference for a product. Vanilla falls back to React in
 * Headless because Headless has no Vanilla adapter.
 */
export function integrationForProduct(
  product: 'viewer' | 'headless',
  preferred: DocsIntegration | null | undefined,
): DocsIntegration {
  const supported = PRODUCT_INTEGRATIONS[product] as readonly DocsIntegration[];
  if (preferred && supported.includes(preferred)) return preferred;
  return DEFAULT_PRODUCT_INTEGRATION[product];
}

/** Rewrites a canonical or concrete product route to one integration sibling. */
export function docsIntegrationHref(route: string, preferred: DocsIntegration): string {
  const segments = route.split('/');
  const product = segments[2];
  if (product !== 'viewer' && product !== 'headless') return route;

  const current = segments[3];
  const hasConcreteIntegration =
    product === 'viewer' ? isDocsIntegration(current) : isHeadlessIntegration(current);
  const rest = segments.slice(hasConcreteIntegration ? 4 : 3).filter(Boolean);
  const integration = integrationForProduct(product, preferred);

  return `/docs/${product}/${integration}${rest.length ? `/${rest.join('/')}` : ''}`;
}
