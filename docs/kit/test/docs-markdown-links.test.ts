import { describe, expect, it } from 'vitest';

import {
  renderDocsMarkdownWith,
  resolveDocsTreeWith,
  stringifyDocsTree,
  type DocsMarkdownSite,
} from '../src/docs-markdown';

const INTEGRATIONS = ['vanilla', 'react', 'vue', 'svelte', 'angular'];
const LABELS: Record<string, string> = {
  vanilla: 'Vanilla JS',
  react: 'React',
  vue: 'Vue',
  angular: 'Angular',
};

/** A site whose viewer and headless pages have a URL per integration, as both sites' do. */
const site: DocsMarkdownSite = {
  siteOrigin: 'https://docs.example',
  engine: 'local',
  resolveExampleFiles: () => undefined,
  readCodeFile: () => null,
  isFramework: (value) => INTEGRATIONS.includes(value),
  variantLabel: (integration) => LABELS[integration] ?? integration,
  resolveContentHref: (url, integration) => {
    const [, product, rest = ''] = url.match(/^\/docs\/(viewer|headless)(\/.*)?$/) ?? [];
    if (!product || !integration) return url;
    const segments = rest.split('/').filter(Boolean);
    if (INTEGRATIONS.includes(segments[0])) segments.shift();
    return ['/docs', product, integration, ...segments].join('/');
  },
};

const exported = (sourceCode: string, canonicalPath: string, integration?: string) =>
  renderDocsMarkdownWith(site, { sourceCode, canonicalPath, integration });

describe('links in the Markdown export', () => {
  const stage = '/docs/headless/react/viewing/stage';

  it('gives a link written from the page its full URL', () => {
    const markdown = exported(
      '[Render](render) and [selection](../text/selection#handles).',
      stage,
      'react',
    );

    expect(markdown).toContain('(https://docs.example/docs/headless/react/viewing/render.md)');
    expect(markdown).toContain(
      '(https://docs.example/docs/headless/react/text/selection.md#handles)',
    );
  });

  it('reads an index page’s links from its URL, and keeps its framework', () => {
    expect(exported('[Stage](viewing/stage)', '/docs/headless/vue', 'vue')).toContain(
      '(https://docs.example/docs/headless/vue/viewing/stage.md)',
    );
    expect(exported('[Plugins](code/plugins)', '/docs/viewer/vanilla', 'vanilla')).toContain(
      '(https://docs.example/docs/viewer/vanilla/code/plugins.md)',
    );
    expect(exported('[Fonts](engine/fonts)', '/docs/engine')).toContain(
      '(https://docs.example/docs/engine/fonts.md)',
    );
  });

  it('names the Markdown of every docs page it links, on either site', () => {
    const markdown = exported(
      [
        '[Fonts](/docs/engine/fonts?tab=cloud#subsets)',
        '[Overview](/docs)',
        '[Cloud](https://www.cloudpdf.com/docs/engine/quick-start)',
        '[Already](/docs/engine/fonts.md)',
      ].join('\n\n'),
      stage,
      'react',
    );

    expect(markdown).toContain('(https://docs.example/docs/engine/fonts.md?tab=cloud#subsets)');
    expect(markdown).toContain('(https://docs.example/docs.md)');
    expect(markdown).toContain('(https://www.cloudpdf.com/docs/engine/quick-start.md)');
    expect(markdown).toContain('(https://docs.example/docs/engine/fonts.md)');
    expect(markdown).not.toContain('.md.md');
  });

  it('reads a docs link’s page up to its query or fragment, without the slashes it ends on', () => {
    const markdown = exported(
      [
        '[Slash](/docs/engine/fonts/)',
        '[Slashes](/docs/engine/fonts///#subsets)',
        '[Fragment first](/docs/engine/fonts#a?b)',
        '[Home](https://www.embedpdf.com/)',
        '[Not docs](/docsify/setup)',
      ].join('\n\n'),
      stage,
      'react',
    );

    expect(markdown).toContain('[Slash](https://docs.example/docs/engine/fonts.md)');
    expect(markdown).toContain('[Slashes](https://docs.example/docs/engine/fonts.md#subsets)');
    expect(markdown).toContain('[Fragment first](https://docs.example/docs/engine/fonts.md#a?b)');
    expect(markdown).toContain('[Home](https://www.embedpdf.com/)');
    expect(markdown).toContain('[Not docs](https://docs.example/docsify/setup)');
  });

  // A pass that starts over at every slash takes minutes here, and the test times out.
  it('reads a link of any length in one pass', () => {
    const slashes = '/'.repeat(200_000);
    const markdown = exported(`[Long](/docs/engine/fonts${slashes}x${slashes})`, stage, 'react');

    expect(markdown).toContain(`fonts${slashes}x.md)`);
  });

  it('leaves every other link as written', () => {
    const markdown = exported(
      [
        '[Methods](#methods)',
        '[Pricing](/pricing)',
        '[Old docs](https://v2.embedpdf.com/docs/setup)',
        '[Mail](mailto:hi@docs.example)',
        '[Spec](https://example.com/docs/spec)',
      ].join('\n\n'),
      stage,
      'react',
    );

    expect(markdown).toContain('(#methods)');
    expect(markdown).toContain('(https://docs.example/pricing)');
    expect(markdown).toContain('(https://v2.embedpdf.com/docs/setup)');
    expect(markdown).toContain('(mailto:hi@docs.example)');
    expect(markdown).toContain('(https://example.com/docs/spec)');
  });

  it('gives cards and raw anchors the same links', () => {
    const markdown = exported(
      [
        '<Cards>',
        '  <Card title="Setup" href="../setup" />',
        '</Cards>',
        '',
        'See <a href="render#tiles">tiles</a>.',
      ].join('\n'),
      stage,
      'react',
    );

    expect(markdown).toContain('[Setup](https://docs.example/docs/headless/react/setup.md)');
    expect(markdown).toContain(
      '[tiles](https://docs.example/docs/headless/react/viewing/render.md#tiles)',
    );
  });

  it('gives an image and a file their full URL, and never a Markdown one', () => {
    const markdown = exported(
      [
        '![Reader](/screenshots/reader.png)',
        '![Camera](camera.svg)',
        '[The keys screen](/docs/platform/api-keys.png)',
      ].join('\n\n'),
      stage,
      'react',
    );

    expect(markdown).toContain('(https://docs.example/screenshots/reader.png)');
    expect(markdown).toContain('(https://docs.example/docs/headless/react/viewing/camera.svg)');
    expect(markdown).toContain('(https://docs.example/docs/platform/api-keys.png)');
  });

  it('gives a site’s own components the same targets', () => {
    const projecting: DocsMarkdownSite = {
      ...site,
      projectComponent: (node, { absoluteContentUrl }) =>
        node.name === 'Screenshot'
          ? [
              {
                type: 'paragraph',
                children: [
                  { type: 'image', url: absoluteContentUrl('/docs/platform/usage.png'), alt: '' },
                  {
                    type: 'link',
                    url: absoluteContentUrl('../setup'),
                    children: [{ type: 'text', value: 'Setup' }],
                  },
                ],
              },
            ]
          : null,
    };
    const markdown = renderDocsMarkdownWith(projecting, {
      sourceCode: '<Screenshot />',
      canonicalPath: stage,
      integration: 'react',
    });

    expect(markdown).toContain('(https://docs.example/docs/platform/usage.png)');
    expect(markdown).toContain('[Setup](https://docs.example/docs/headless/react/setup.md)');
  });

  it('keeps page URLs in the tree search reads', () => {
    const tree = resolveDocsTreeWith(site, {
      sourceCode: '[Fonts](/docs/engine/fonts) and [setup](setup).',
    });

    expect(stringifyDocsTree(tree)).toContain(
      '[Fonts](https://docs.example/docs/engine/fonts) and [setup](setup).',
    );
  });
});

describe('the other variants in the Markdown export', () => {
  const options = {
    sourceCode: '# Stage',
    canonicalPath: '/docs/headless/react/viewing/stage',
    integration: 'react',
    variantKey: 'framework',
  };

  it('names each sibling by the URL of its Markdown', () => {
    const markdown = renderDocsMarkdownWith(site, { ...options, siblings: ['vue', 'angular'] });

    expect(markdown).toContain(
      [
        'framework: "React"',
        'other_frameworks:',
        '  "Vue": "https://docs.example/docs/headless/vue/viewing/stage.md"',
        '  "Angular": "https://docs.example/docs/headless/angular/viewing/stage.md"',
        'source: "https://docs.example/docs/headless/react/viewing/stage"',
      ].join('\n'),
    );
  });

  it('says nothing when the page has none', () => {
    expect(renderDocsMarkdownWith(site, options)).not.toContain('other_');
    expect(renderDocsMarkdownWith(site, { ...options, siblings: [] })).not.toContain('other_');
  });
});
