import { docsIntegrationHref, type DocsIntegration } from '../docs-integrations';

/**
 * Resolves a stored content source to the URL this particular reader should
 * land on.
 *
 * This is the whole reason the index stores content sources rather than public
 * URLs: `docs/headless/plugins/stage` is indexed once, and a React reader gets
 * the React route while a Vue reader gets the Vue one. Indexing the fanned-out
 * URLs instead would return the same passage four times for every query.
 *
 * `docsIntegrationHref` also validates the pairing, so a Vanilla preference on
 * a Headless page falls back to React rather than producing a dead route.
 */
export function urlForSection(
  contentPath: string,
  anchor: string | null,
  integration: DocsIntegration | null,
): string {
  const route = `/${contentPath}`;
  const resolved = integration ? docsIntegrationHref(route, integration) : route;
  return anchor ? `${resolved}#${anchor}` : resolved;
}
