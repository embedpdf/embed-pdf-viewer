import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { liveSiblings } from './docs-release';
import { docsSitemapPaths } from './docs-sitemap';
import { renderLlms } from './llms';

/**
 * The publish gate, per framework (`./docs-release`), on a gate written here: an llms file and
 * the sitemap list a page only where it's live, and a page's Markdown names only its live
 * siblings.
 */

const GATE = vi.hoisted(() => ({
  sites: {
    local: {
      pages: {
        'text/search': {
          pending: [],
          live: { react: true, vue: false, svelte: true, angular: false },
        },
        'viewer/documents': {
          pending: [],
          live: { vanilla: true, react: true, vue: false, svelte: false, angular: false },
        },
      },
    },
    cloud: { pages: {} },
  },
}));

vi.mock('@embedpdf/docs-kit/publish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@embedpdf/docs-kit/publish')>()),
  loadLivePages: () => GATE,
}));

const SEARCH = ['docs', 'headless', 'text', 'search'];

describe('the publish gate, per framework', () => {
  beforeEach(() => vi.stubEnv('DOCS_PREVIEW', '0'));
  afterEach(() => vi.unstubAllEnvs());

  it('names a page’s live siblings, and never the page’s own integration', () => {
    expect(liveSiblings(SEARCH, 'react')).toEqual(['svelte']);
    expect(liveSiblings(['docs', 'viewer', 'documents'], 'vanilla')).toEqual(['react']);
  });

  it('names them on a page that is held back too', () => {
    expect(liveSiblings(SEARCH, 'vue')).toEqual(['react', 'svelte']);
  });

  it('names none for a page without integrations', () => {
    expect(liveSiblings(['docs', 'engine', 'fonts'], undefined)).toEqual([]);
  });

  it('lists a page in a framework’s file only where it is live', () => {
    const search = (framework: string) =>
      `(https://www.embedpdf.com/docs/headless/${framework}/text/search.md)`;

    expect(renderLlms('svelte')).toContain(search('svelte'));
    expect(renderLlms('react')).toContain(search('react'));
    expect(renderLlms('vue')).not.toContain('/docs/headless/vue/');
    expect(renderLlms('vue')).not.toContain('## Headless Components');
    expect(renderLlms('vue')).toContain('## EmbedPDF Engine');
  });

  it('lists a page in the sitemap only where it is live', () => {
    const paths = docsSitemapPaths();

    expect(paths.filter((path) => path.startsWith('/docs/headless/'))).toEqual([
      '/docs/headless/react/text/search',
      '/docs/headless/svelte/text/search',
    ]);
    expect(paths.filter((path) => path.startsWith('/docs/viewer/'))).toEqual([
      '/docs/viewer/vanilla/documents',
      '/docs/viewer/react/documents',
    ]);
    expect(paths).toContain('/docs/engine/quick-start');
  });

  it('keeps /llms.txt on each product’s default integration', () => {
    const body = renderLlms(null);

    expect(body).toContain('(https://www.embedpdf.com/docs/headless/react/text/search.md)');
    expect(body).toContain('(https://www.embedpdf.com/docs/viewer/vanilla/documents.md)');
    expect(body).not.toContain('/docs/headless/svelte/');
  });
});
