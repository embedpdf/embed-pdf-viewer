import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderDocsMarkdown } from './docs-markdown';

const gettingStarted = fs.readFileSync(
  path.resolve(process.cwd(), 'src/content/docs/headless/getting-started.mdx'),
  'utf8',
);

describe('renderDocsMarkdown', () => {
  it('exports only the active framework and expands its complete example', () => {
    const markdown = renderDocsMarkdown({
      sourceCode: gettingStarted,
      canonicalPath: '/docs/headless/react/getting-started',
      framework: 'react',
      metadata: {
        title: 'Getting Started',
        description: 'Build your own PDF viewer UI.',
      },
    });

    expect(markdown).toContain('title: "Getting Started — React"');
    expect(markdown).toContain('\n---\n\n# Getting Started');
    expect(markdown).toContain('pnpm add @embedpdf/react @embedpdf/engine');
    expect(markdown).toContain('import { deferredEngine, DocumentGate, Viewer }');
    expect(markdown).toContain('**`basic.tsx`**');
    expect(markdown).not.toContain('@embedpdf/vue');
    expect(markdown).not.toContain('@embedpdf/svelte');
    expect(markdown).not.toContain('@embedpdf/angular');
    expect(markdown).not.toContain('<Fw');
    expect(markdown).not.toContain('<Example');
    expect(markdown).not.toContain('highlightedCode');
  });

  it('makes internal links portable and framework-specific', () => {
    const markdown = renderDocsMarkdown({
      sourceCode: '[Next](/docs/headless/selection)',
      canonicalPath: '/docs/headless/vue/current',
      framework: 'vue',
    });

    expect(markdown).toContain('(https://www.embedpdf.com/docs/headless/vue/selection)');
  });

  it('fails when a custom component has no explicit Markdown projection', () => {
    expect(() =>
      renderDocsMarkdown({
        sourceCode: '<InteractiveWidget />',
        canonicalPath: '/docs/example',
      }),
    ).toThrow('No Markdown projection is defined for <InteractiveWidget>.');
  });
});
