import path from 'node:path';

import {
  docsRelease as releaseOf,
  isDocsPreview,
  loadLivePages,
  type DocsRelease,
} from '@embedpdf/docs-kit/publish';

import { docsIntegrationHref } from './docs-integrations';

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
  });
}

/** Where a held-back page points: its React version, when that one is live. */
export function reactVersionHref(route: string, release: DocsRelease): string | null {
  return release.reactLive ? docsIntegrationHref(route, 'react') : null;
}
