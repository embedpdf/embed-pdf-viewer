import path from 'node:path';

import {
  docsRelease as releaseOf,
  isDocsPreview,
  loadLivePages,
  type DocsRelease,
} from '@embedpdf/docs-kit/publish';

import { DOCS_SITE } from '../docs-site';

import {
  docsIntegrationHref,
  PRODUCT_INTEGRATIONS,
  type DocsIntegration,
} from './docs-integrations';

export type { DocsRelease };

/** Written by `docs:check` before every build (docs/content/scripts/publish-gate.mjs). */
const LIVE_PAGES = path.resolve(process.cwd(), '../docs/content/generated/live-pages.json');

/**
 * What a docs route shows on this site: its page, or, when the publish gate holds the page back
 * for the route's framework, its title and why (`@embedpdf/docs-kit/publish`).
 */
export function docsRelease(contentPath: string[], integration?: string): DocsRelease {
  return releaseOf({
    contentPath: contentPath.join('/'),
    framework: integration,
    preview: isDocsPreview(),
    livePages: () => loadLivePages(LIVE_PAGES),
    engine: DOCS_SITE.engine,
  });
}

/**
 * The other integrations a fanned-out page is live for. Its Markdown names them
 * (`other_frameworks`), so a reader working in one of them can switch to its version.
 */
export function liveSiblings(
  contentPath: string[],
  integration: DocsIntegration | undefined,
): DocsIntegration[] {
  const product = contentPath[1];
  if (!integration || (product !== 'viewer' && product !== 'headless')) return [];
  return (PRODUCT_INTEGRATIONS[product] as readonly DocsIntegration[]).filter(
    (sibling) => sibling !== integration && docsRelease(contentPath, sibling).live,
  );
}

/** Where a held-back page points: its React version, when that one is live. */
export function reactVersionHref(route: string, release: DocsRelease): string | null {
  return release.reactLive ? docsIntegrationHref(route, 'react') : null;
}
