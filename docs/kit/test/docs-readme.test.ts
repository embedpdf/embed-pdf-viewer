import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderDocsReadmeWith, type DocsMarkdownSite } from '../src/docs-markdown';

const INTEGRATIONS = ['vanilla', 'react', 'vue', 'svelte', 'angular'];

/** A site with one example, `search/basic`, written for React. */
const site: DocsMarkdownSite = {
  siteOrigin: 'https://docs.example',
  engine: 'local',
  resolveExampleFiles: (name, integration) =>
    name === 'search/basic' && integration === 'react'
      ? [{ filename: 'basic.tsx', code: 'export const App = () => null;\n', language: 'tsx' }]
      : undefined,
  readCodeFile: () => null,
  isFramework: (value) => INTEGRATIONS.includes(value),
};

const page = '/docs/headless/react/text/search';

const readme = (sourceCode: string, section?: string) =>
  renderDocsReadmeWith(site, { sourceCode, canonicalPath: page, integration: 'react', section });

const lines = (...text: string[]) => text.join('\n');

describe('the cut of a page', () => {
  const source = lines(
    '---',
    'title: Search',
    '---',
    '',
    "import { Cards, Card } from '@/components/docs/cards';",
    '',
    '# Search',
    '',
    'Finds text.',
    '',
    '## Options',
    '',
    'Whole words.',
    '',
    '### Case',
    '',
    'Match case.',
    '',
    '## Events',
    '',
    'A hit.',
  );

  it('is the opening: what is under the title, up to the first section', () => {
    expect(readme(source).cut).toBe('Finds text.');
  });

  it('comes with the page’s title and description, as its frontmatter gives them', () => {
    const described = source.replace('title: Search', 'title: Search\ndescription: "Find: text."');

    expect(readme(described)).toMatchObject({ title: 'Search', description: 'Find: text.' });
    expect(readme(source)).toMatchObject({ title: 'Search', description: null });
    expect(readme('# Search')).toMatchObject({ title: null, description: null });
  });

  it('goes on to the end marker, on a page that has one', () => {
    const marked = source.replace('## Events', '{/* readme: end */}\n\n## Events');

    expect(readme(marked).cut).toBe(
      lines(
        'Finds text.',
        '',
        '### Options',
        '',
        'Whole words.',
        '',
        '#### Case',
        '',
        'Match case.',
      ),
    );
  });

  it('is the section the README names, up to the next one', () => {
    expect(readme(source, 'Options').cut).toBe(
      lines('Whole words.', '', '#### Case', '', 'Match case.'),
    );
  });

  it('ends a named section at the marker inside it', () => {
    const marked = source.replace('### Case', '{/* readme: end */}\n\n### Case');

    expect(readme(marked, 'Options').cut).toBe('Whole words.');
    expect(readme(marked, 'Events').cut).toBe('A hit.');
  });

  it('gives a section with its heading, at the page’s own levels, when asked for', () => {
    const whole = (sourceCode: string) =>
      renderDocsReadmeWith(site, {
        sourceCode,
        canonicalPath: page,
        integration: 'react',
        section: 'Options',
        withHeading: true,
      }).cut;

    expect(whole(source)).toBe(
      lines('## Options', '', 'Whole words.', '', '### Case', '', 'Match case.'),
    );
    expect(whole(source.replace('### Case', '{/* readme: end */}\n\n### Case'))).toBe(
      lines('## Options', '', 'Whole words.'),
    );
  });

  it('gives the opening under the page’s title, as a second-level heading, when asked for', () => {
    const { cut } = renderDocsReadmeWith(site, {
      sourceCode: source,
      canonicalPath: page,
      integration: 'react',
      withHeading: true,
    });

    expect(cut).toBe(lines('## Search', '', 'Finds text.'));
  });

  it('fails on a section the page does not have', () => {
    expect(() => readme(source, 'Settings')).toThrow('The page has no section "Settings".');
  });

  it('fails on a marker that stands twice, or inside a block', () => {
    const twice = `${source}\n\n{/* readme: end */}\n\nMore.\n\n{/* readme: end */}`;
    const inside = `${source}\n\n<Fw only="react">\n\n{/* readme: end */}\n\n</Fw>`;

    expect(() => readme(twice)).toThrow('stands once, at the top level');
    expect(() => readme(inside)).toThrow('stands once, at the top level');
  });

  it('reads only the cut: a component with no projection fails inside it, not after it', () => {
    expect(readme(`${source}\n\n<Unknown />`).cut).toBe('Finds text.');
    expect(() => readme(source.replace('Finds text.', '<Unknown />'))).toThrow(
      'No Markdown projection is defined for <Unknown>.',
    );
  });
});

describe('a page’s Markdown in a README', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('shows the code of an open example, and leaves a demo and its hint out', () => {
    const { cut } = readme(
      lines(
        '# Search',
        '',
        'Search from your own box:',
        '',
        '<Example name="search/basic" mode="open" />',
        '',
        '<Example name="search/whole-words" />',
        '',
        '> **Try it:** type a word.',
        '',
        '> A note that stays.',
      ),
    );

    expect(cut).toBe(
      lines(
        'Search from your own box:',
        '',
        '**`basic.tsx`**',
        '',
        '```tsx',
        'export const App = () => null;',
        '```',
        '',
        '> A note that stays.',
      ),
    );
  });

  it('shows a command without a file name', () => {
    const installs: DocsMarkdownSite = {
      ...site,
      resolveExampleFiles: () => [
        { filename: 'install.sh', code: 'npm install @embedpdf/viewer-react\n', language: 'sh' },
      ],
    };
    const { cut } = renderDocsReadmeWith(installs, {
      sourceCode: '# Quick start\n\n<Snippet name="viewer/start/install" />',
      canonicalPath: '/docs/viewer/react/quick-start',
      integration: 'react',
    });

    expect(cut).toBe(lines('```sh', 'npm install @embedpdf/viewer-react', '```'));
  });

  it('keeps an install command as written', () => {
    vi.stubEnv('DOCS_INSTALL_CHANNEL', 'next');
    const { cut } = readme(
      lines('# Setup', '', '```sh npm2yarn', 'npm install @embedpdf/react @embedpdf/engine', '```'),
    );

    expect(cut).toBe(lines('```sh', 'npm install @embedpdf/react @embedpdf/engine', '```'));
  });

  it('gives every link the full URL of a page, a place on this page included', () => {
    const { cut } = readme(
      lines(
        '# Search',
        '',
        '[Options](#options), [the Stage](../viewing/stage#zoom), [fonts](/docs/engine/fonts)',
        'and [pricing](https://docs.example/pricing).',
      ),
    );

    expect(cut).toContain(`[Options](https://docs.example${page}#options)`);
    expect(cut).toContain('(https://docs.example/docs/headless/react/viewing/stage#zoom)');
    expect(cut).toContain('(https://docs.example/docs/engine/fonts)');
    expect(cut).toContain('(https://docs.example/pricing)');
    expect(cut).not.toContain('.md');
  });

  it('shows each name as the README’s framework has it', () => {
    const source = lines('# Search', '', 'Import `@embedpdf/react/search` and call `useSearch()`.');
    const vue = renderDocsReadmeWith(site, {
      sourceCode: source,
      canonicalPath: '/docs/headless/vue/text/search',
      integration: 'vue',
    });

    expect(vue.cut).toContain('`@embedpdf/vue/search`');
  });

  it('lists the cards of "Next steps", each with its description after a colon', () => {
    const { cut, nextSteps } = readme(
      lines(
        '# Search',
        '',
        'Finds text.',
        '',
        '## Next steps',
        '',
        'Where to go from here.',
        '',
        '<Cards>',
        '  <Card title="Setup" description="Bundlers and fonts." href="../setup" />',
        '  <Card title="Selecting" href="selection" />',
        '</Cards>',
      ),
    );

    expect(cut).toBe('Finds text.');
    expect(nextSteps).toBe(
      lines(
        '- [Setup](https://docs.example/docs/headless/react/setup): Bundlers and fonts.',
        '- [Selecting](https://docs.example/docs/headless/react/text/selection)',
      ),
    );
  });

  it('has no next steps on a page without the section', () => {
    expect(readme('# Search\n\nFinds text.').nextSteps).toBe('');
  });
});
