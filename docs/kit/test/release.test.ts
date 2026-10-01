import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PreviewBanner, releasedMarkdownSource, UnreleasedNotice } from '../src/release';

const PAGE = '---\ntitle: Search\n---\n\n# Search\n\nFind text.\n';

describe('a page the publish gate holds back', () => {
  it('says why in one sentence, and links to the React version when that one is live', () => {
    const html = renderToStaticMarkup(
      createElement(UnreleasedNotice, {
        framework: 'vue',
        reactHref: '/docs/headless/react/text/search',
      }),
    );
    expect(html).toContain(
      'This page describes EmbedPDF 3.0 for Vue, which isn&#x27;t released yet.',
    );
    expect(html).toContain('href="/docs/headless/react/text/search"');
  });

  it('has no link without a live React version', () => {
    const html = renderToStaticMarkup(createElement(UnreleasedNotice, { framework: 'angular' }));
    expect(html).not.toContain('<a');
  });

  it('exports its title and the same sentence as Markdown', () => {
    const source = releasedMarkdownSource({
      sourceCode: PAGE,
      title: undefined,
      framework: 'svelte',
      release: { live: false, preview: false, reactLive: false },
      reactUrl: null,
    });
    expect(source).toBe(
      "# Search\n\nThis page describes EmbedPDF 3.0 for Svelte, which isn't released yet.\n",
    );
  });
});

describe('the preview site', () => {
  it('puts the banner under the title of a page production holds back', () => {
    expect(renderToStaticMarkup(createElement(PreviewBanner, { framework: 'vue' }))).toContain(
      'Preview: this page describes EmbedPDF 3.0 for Vue, which isn&#x27;t released yet.',
    );
    const source = releasedMarkdownSource({
      sourceCode: PAGE,
      title: 'Search',
      framework: 'vue',
      release: { live: true, preview: true, reactLive: true },
      reactUrl: null,
    });
    expect(source).toBe(
      "---\ntitle: Search\n---\n\n# Search\n\n> Preview: this page describes EmbedPDF 3.0 for Vue, which isn't released yet.\n\nFind text.\n",
    );
  });

  it('leaves a live page as it is', () => {
    const release = { live: true, preview: false, reactLive: true };
    expect(
      releasedMarkdownSource({
        sourceCode: PAGE,
        title: 'Search',
        framework: 'react',
        release,
        reactUrl: null,
      }),
    ).toBe(PAGE);
  });
});
