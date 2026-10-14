import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderDocsMarkdown } from './docs-markdown';

const quickStart = fs.readFileSync(
  path.resolve(process.cwd(), 'src/content/docs/headless/quick-start.mdx'),
  'utf8',
);
const viewerQuickStart = fs.readFileSync(
  path.resolve(process.cwd(), 'src/content/docs/viewer/quick-start.mdx'),
  'utf8',
);

describe('renderDocsMarkdown', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('exports only the active Headless integration and expands its complete example', () => {
    vi.stubEnv('DOCS_INSTALL_CHANNEL', 'next');
    const markdown = renderDocsMarkdown({
      sourceCode: quickStart,
      canonicalPath: '/docs/headless/react/quick-start',
      integration: 'react',
      metadata: {
        title: 'Quick start',
        description: 'Build your own PDF viewer UI.',
      },
    });

    expect(markdown).toContain('title: "Quick start — React"');
    expect(markdown).toContain('\n---\n\n# Quick start');
    expect(markdown).toContain('pnpm add @embedpdf/react@next @embedpdf/engine@next');
    expect(markdown).toContain("import { localEngine } from '@embedpdf/engine'");
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
      integration: 'vue',
    });

    expect(markdown).toContain('(https://www.embedpdf.com/docs/headless/vue/selection)');
  });

  it('exports only the selected Viewer integration', () => {
    const markdown = renderDocsMarkdown({
      sourceCode: viewerQuickStart,
      canonicalPath: '/docs/viewer/vue/quick-start',
      integration: 'vue',
      metadata: {
        title: 'Quick start',
        description: 'Install the viewer, show a PDF, and make it yours.',
      },
    });

    expect(markdown).toContain('title: "Quick start — Vue"');
    expect(markdown).toContain('integration: "Vue"');
    expect(markdown).toContain('@embedpdf/viewer-vue');
    expect(markdown).toContain("import { PDFViewer } from '@embedpdf/viewer-vue'");
    expect(markdown).not.toContain('@embedpdf/viewer-react');
    expect(markdown).not.toContain('@embedpdf/viewer-angular');
    expect(markdown).not.toContain('<Snippet');
  });

  it('shows a viewer page’s <Fw> branch on its own integration, plain HTML included', () => {
    const sourceCode = [
      '# Events',
      '',
      '<Fw only="vanilla">Listen for `epdf:ready` on the element.</Fw>',
      '',
      "<Fw only={['react', 'vue']}>Pass `onReady`.</Fw>",
    ].join('\n');
    const exported = (integration: 'vanilla' | 'react' | 'angular') =>
      renderDocsMarkdown({
        sourceCode,
        canonicalPath: `/docs/viewer/${integration}/code/viewer`,
        integration,
      });

    expect(exported('vanilla')).toContain('Listen for `epdf:ready` on the element.');
    expect(exported('vanilla')).not.toContain('Pass `onReady`.');
    expect(exported('react')).toContain('Pass `onReady`.');
    expect(exported('react')).not.toContain('epdf:ready');
    expect(exported('angular')).not.toContain('epdf:ready');
    expect(exported('angular')).not.toContain('onReady');
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
