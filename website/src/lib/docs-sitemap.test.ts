import { listDocsPages } from '@embedpdf/docs-kit/llms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { docsSitemapPaths } from './docs-sitemap';

/**
 * The docs pages the sitemap lists (`./docs-sitemap`), as the preview site shows them, where
 * every page is live. `./llms-release.test.ts` has the publish gate.
 */
describe('the docs pages in the sitemap', () => {
  beforeEach(() => vi.stubEnv('DOCS_PREVIEW', '1'));
  afterEach(() => vi.unstubAllEnvs());

  it('lists each page once for every integration it is written for', () => {
    const paths = docsSitemapPaths();
    const pages = listDocsPages(`${process.cwd()}/src/content`).map((page) => page.contentPath);
    const count = (product: string) =>
      pages.filter((contentPath) => contentPath.split('/')[1] === product).length;

    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toHaveLength(
      pages.length + count('viewer') * (5 - 1) + count('headless') * (4 - 1),
    );
    for (const integration of ['vanilla', 'react', 'vue', 'svelte', 'angular']) {
      expect(paths).toContain(`/docs/viewer/${integration}/quick-start`);
    }
    for (const framework of ['react', 'vue', 'svelte', 'angular']) {
      expect(paths).toContain(`/docs/headless/${framework}/text/search`);
    }
    expect(paths).not.toContain('/docs/headless/vanilla/text/search');
  });

  it('lists a page by the URL it answers on, never the door that redirects to it', () => {
    const paths = docsSitemapPaths();

    expect(paths).toContain('/docs');
    expect(paths).toContain('/docs/viewer/vanilla');
    expect(paths).toContain('/docs/engine');
    expect(paths).not.toContain('/docs/viewer');
    expect(paths).not.toContain('/docs/headless');
    expect(paths).not.toContain('/docs/headless/text/search');
    for (const path of paths) expect(path).toMatch(/^\/docs(\/[a-z0-9-]+)*$/);
  });

  it('keeps the sidebar’s order, a page’s integrations together', () => {
    const paths = docsSitemapPaths();

    expect(paths[0]).toBe('/docs');
    expect(paths.indexOf('/docs/headless/react')).toBeLessThan(
      paths.indexOf('/docs/headless/react/quick-start'),
    );
    expect(paths.indexOf('/docs/headless/vue/quick-start')).toBe(
      paths.indexOf('/docs/headless/react/quick-start') + 1,
    );
  });
});
