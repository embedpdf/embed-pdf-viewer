import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderDocsMarkdown } from './docs-markdown';
import type { DocsRelease } from './docs-release';

/**
 * The publish gate on this site (`./docs-release`): a headless page's Markdown export says what
 * the page says, in full, or its title and why it's held back.
 */

const SEARCH = fs.readFileSync(
  path.resolve(process.cwd(), 'src/content/docs/headless/text/search.mdx'),
  'utf8',
);

const HELD_BACK: DocsRelease = { live: false, preview: false, reactLive: true };
const PREVIEW: DocsRelease = { live: true, preview: true, reactLive: true };

const markdownFor = (framework: 'react' | 'vue', release: DocsRelease) =>
  renderDocsMarkdown({
    sourceCode: SEARCH,
    canonicalPath: `/docs/headless/${framework}/text/search`,
    integration: framework,
    metadata: { title: 'Search', description: 'Find text in a document.' },
    release,
  });

describe('a page the publish gate holds back', () => {
  it('shows its title and one sentence, and points at the React version when that one is live', () => {
    const markdown = markdownFor('vue', HELD_BACK);
    const body = markdown.split('---\n').at(-1)?.trim();

    expect(body).toBe(
      "# Search\n\nThis page describes EmbedPDF 3.0 for Vue, which isn't released yet. " +
        '[Read the React version](https://www.embedpdf.com/docs/headless/react/text/search).',
    );
    expect(markdown).toContain('title: "Search — Vue"');
    expect(markdown).toContain('source: "https://www.embedpdf.com/docs/headless/vue/text/search"');
  });

  it('has no link when the React version is held back too', () => {
    const markdown = markdownFor('react', { ...HELD_BACK, reactLive: false });
    expect(markdown).toContain(
      "This page describes EmbedPDF 3.0 for React, which isn't released yet.",
    );
    expect(markdown).not.toContain('Read the React version');
  });

  it('shows nothing else from the page', () => {
    expect(markdownFor('vue', HELD_BACK)).not.toContain('## Methods');
  });
});

describe('a viewer page the publish gate holds back', () => {
  it('says so for plain HTML, and points at the React version', () => {
    const markdown = renderDocsMarkdown({
      sourceCode: fs.readFileSync(
        path.resolve(process.cwd(), 'src/content/docs/viewer/customize/layout.mdx'),
        'utf8',
      ),
      canonicalPath: '/docs/viewer/vanilla/customize/layout',
      integration: 'vanilla',
      metadata: { title: 'Layout', description: 'Put toolbars at any edge.' },
      release: HELD_BACK,
    });

    expect(markdown.split('---\n').at(-1)?.trim()).toBe(
      "# Layout\n\nThis page describes EmbedPDF 3.0 for Vanilla JS, which isn't released yet. " +
        '[Read the React version](https://www.embedpdf.com/docs/viewer/react/customize/layout).',
    );
  });
});

describe('the preview site', () => {
  it('shows the page in full, with the banner under its title', () => {
    const markdown = markdownFor('vue', PREVIEW);

    expect(markdown).toMatch(
      /# Search\n+> Preview: this page describes EmbedPDF 3\.0 for Vue, which isn't released yet\./,
    );
    expect(markdown).toContain('## Methods');
  });
});

describe('a live page', () => {
  it('shows in full, with no banner', () => {
    const markdown = markdownFor('react', { live: true, preview: false, reactLive: true });
    expect(markdown).toContain('## Methods');
    expect(markdown).not.toContain('Preview:');
  });
});
