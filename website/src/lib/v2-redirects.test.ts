import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination';
import { describe, expect, it } from 'vitest';

import { resolveDocsPath } from './docs-route';
import { V2_ARCHIVE_ORIGIN, v2Redirects } from './v2-redirects';

const site = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

const V2_URLS = readFileSync(new URL('./v2-site-urls.txt', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('/'));

/** Where this site sends `path`, with Next.js's own matcher: the first matching entry wins. */
function redirectOf(path: string): string | null {
  for (const { source, destination } of v2Redirects()) {
    const params = getPathMatch(source, { removeUnnamedParams: true, strict: true })(path);
    if (!params) continue;
    const { newUrl, parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination,
      params,
      query: {},
    });
    const { protocol, hostname } = parsedDestination;
    return hostname ? `${protocol}//${hostname}${newUrl}` : newUrl;
  }
  return null;
}

/** Whether this site answers `path` itself: a docs page, an app route or a public file. */
function servesItself(path: string): boolean {
  if (existsSync(site(`public${path}`)) && path !== '/') return true;
  const segments = path.split('/').filter(Boolean);
  if (segments[0] === 'docs') {
    const resolved = resolveDocsPath(segments);
    if (!resolved) return false;
    const content = `src/content/${resolved.contentPath.join('/')}`;
    return existsSync(site(`${content}.mdx`)) || existsSync(site(`${content}/index.mdx`));
  }
  const route = segments.join('/');
  return ['(site)', '(app)'].some((group) =>
    existsSync(site(`src/app/${group}${route ? `/${route}` : ''}/page.tsx`)),
  );
}

describe('the 2.x site’s URLs', () => {
  it.each(V2_URLS)('%s still answers', (path) => {
    const destination = redirectOf(path);
    if (destination === null) {
      expect(servesItself(path)).toBe(true);
    } else if (destination.startsWith(V2_ARCHIVE_ORIGIN)) {
      // The archive is the 2.x site as it was: the same path answers there.
      expect(destination).toBe(`${V2_ARCHIVE_ORIGIN}${path}`);
    } else {
      expect(servesItself(destination), destination).toBe(true);
    }
  });

  it('sends a moved page to its counterpart, not the archive', () => {
    expect(redirectOf('/docs/react/headless/plugins/plugin-stamp')).toBe(
      '/docs/headless/react/annotations/stamps',
    );
    expect(redirectOf('/docs/snippet/getting-started')).toBe('/docs/viewer/vanilla/quick-start');
    expect(redirectOf('/docs/engines/rendering/render-page')).toBe(
      '/docs/engine/documents/rendering',
    );
  });

  it('sends what has no counterpart to the same path on the archive', () => {
    expect(redirectOf('/docs/pdfium/functions/FPDF_LoadPage')).toBe(
      `${V2_ARCHIVE_ORIGIN}/docs/pdfium/functions/FPDF_LoadPage`,
    );
    expect(redirectOf('/docs/vue/headless/plugins/plugin-capture')).toBe(
      `${V2_ARCHIVE_ORIGIN}/docs/vue/headless/plugins/plugin-capture`,
    );
  });

  it('leaves this site’s own pages alone', () => {
    for (const path of [
      '/',
      '/docs',
      '/docs/headless/react/quick-start',
      '/docs/viewer/vanilla/quick-start',
      '/docs/engine/setup',
      '/react-pdf-viewer',
      '/tools/pdf-merge',
    ]) {
      expect(redirectOf(path), path).toBeNull();
    }
  });
});
