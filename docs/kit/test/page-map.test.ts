import { describe, expect, it } from 'vitest';

import { sidebarPageMap } from '../src/page-map';

const page = (name: string, frontMatter: Record<string, unknown>) => ({
  name,
  route: `/docs/${name}`,
  title: name,
  frontMatter,
});

describe('sidebarPageMap', () => {
  it('keeps the frontmatter a sidebar reads, at every depth', () => {
    const map = sidebarPageMap([
      {
        name: 'api',
        route: '/docs/api',
        children: [
          page('issue', {
            title: 'Issue a token',
            description: 'Mint a document token.',
            filePath: 'src/content/docs/api/issue.mdx',
            method: 'POST',
            audience: 'operator',
            engines: ['cloud'],
          }),
        ],
      },
    ]);

    expect(map).toEqual([
      {
        name: 'api',
        route: '/docs/api',
        children: [
          {
            name: 'issue',
            route: '/docs/issue',
            title: 'issue',
            frontMatter: {
              title: 'Issue a token',
              method: 'POST',
              audience: 'operator',
              engines: ['cloud'],
            },
          },
        ],
      },
    ]);
  });

  it('keeps Nextra’s display and theme, and a page with no frontmatter a page', () => {
    const [hidden, bare] = sidebarPageMap([
      page('hidden', { display: 'hidden', theme: { toc: false }, searchable: false }),
      page('bare', {}),
    ]);

    expect(hidden.frontMatter).toEqual({ display: 'hidden', theme: { toc: false } });
    expect(bare.frontMatter).toEqual({});
  });

  it('leaves the map it is given as it was', () => {
    const original = [page('setup', { title: 'Setup', description: 'Install it.' })];

    sidebarPageMap(original);

    expect(original[0].frontMatter.description).toBe('Install it.');
  });
});
