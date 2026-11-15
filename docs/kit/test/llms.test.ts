import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { listDocsPages, renderLlmsTxt } from '../src/llms';

describe('listDocsPages', () => {
  let contentRoot: string;
  afterEach(() => fs.rmSync(contentRoot, { recursive: true, force: true }));

  /** A content folder: each file by its path under it, with what it holds. */
  const content = (files: Record<string, string>) => {
    contentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'llms-pages-'));
    for (const [file, source] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(contentRoot, file)), { recursive: true });
      fs.writeFileSync(path.join(contentRoot, file), source);
    }
    return listDocsPages(contentRoot).map((page) => page.contentPath);
  };
  const page = '---\ntitle: A page\n---\n';

  it('lists pages in the order each folder’s sidebar has them', () => {
    const pages = content({
      'docs/_meta.ts': "export default {\n  index: 'Introduction',\n  headless: 'Headless',\n};\n",
      'docs/index.mdx': page,
      'docs/headless/_meta.ts': [
        '// Generated from docs/content.',
        'export default {',
        "  index: 'Overview',",
        "  'quick-start': 'Quick start',",
        "  viewing: 'Viewing',",
        "  annotations: 'Annotations',",
        '  // Reached from the errors themselves.',
        "  errors: { display: 'hidden' },",
        '};',
        '',
      ].join('\n'),
      'docs/headless/annotations/_meta.ts':
        "export default {\n  index: 'Overview',\n  tools: 'Tools',\n  comments: 'Comments',\n};\n",
      'docs/headless/annotations/comments.mdx': page,
      'docs/headless/annotations/index.mdx': page,
      'docs/headless/annotations/tools.mdx': page,
      'docs/headless/errors.mdx': page,
      'docs/headless/index.mdx': page,
      'docs/headless/quick-start.mdx': page,
      'docs/headless/viewing/_meta.ts':
        "export default {\n  stage: 'Stage',\n  render: 'Render',\n};\n",
      'docs/headless/viewing/render.mdx': page,
      'docs/headless/viewing/stage.mdx': page,
    });

    expect(pages).toEqual([
      'docs',
      'docs/headless',
      'docs/headless/quick-start',
      'docs/headless/viewing/stage',
      'docs/headless/viewing/render',
      'docs/headless/annotations',
      'docs/headless/annotations/tools',
      'docs/headless/annotations/comments',
      'docs/headless/errors',
    ]);
  });

  it('reads a sidebar’s own keys only, not the ones inside an entry', () => {
    const pages = content({
      'docs/_meta.ts': [
        'export default {',
        '  setup: {',
        "    title: 'Setup',",
        "    display: 'hidden',",
        '  },',
        "  display: 'Display',",
        '};',
        '',
      ].join('\n'),
      'docs/display.mdx': page,
      'docs/setup.mdx': page,
    });

    expect(pages).toEqual(['docs/setup', 'docs/display']);
  });

  it('lists what a sidebar doesn’t name after what it does, by name', () => {
    const pages = content({
      'docs/_meta.ts': "export default {\n  setup: 'Setup',\n};\n",
      'docs/advanced.mdx': page,
      'docs/setup.mdx': page,
      'docs/zoom/levels.mdx': page,
      'docs/zoom.mdx': page,
    });

    expect(pages).toEqual(['docs/setup', 'docs/advanced', 'docs/zoom', 'docs/zoom/levels']);
  });
});

describe('renderLlmsTxt', () => {
  const sections = [
    { label: 'Start here', pages: [{ title: 'Overview', url: 'https://docs.example/docs.md' }] },
    { label: 'Empty', pages: [] },
    {
      label: 'Viewer',
      pages: [
        {
          title: 'Setup',
          url: 'https://docs.example/docs/viewer/vue/setup.md',
          description: 'Install the viewer.',
        },
      ],
    },
  ];

  it('is a title, a summary and a list of links per section', () => {
    expect(renderLlmsTxt({ title: 'Example', summary: 'A PDF SDK.', sections })).toBe(
      [
        '# Example',
        '',
        '> A PDF SDK.',
        '',
        '## Start here',
        '',
        '- [Overview](https://docs.example/docs.md)',
        '',
        '## Viewer',
        '',
        '- [Setup](https://docs.example/docs/viewer/vue/setup.md): Install the viewer.',
        '',
      ].join('\n'),
    );
  });

  it('puts the site’s paragraphs between the summary and the first list', () => {
    const body = renderLlmsTxt({
      title: 'Example',
      summary: 'A PDF SDK.',
      details: ['Pages are listed for React.', 'Each framework has a file of its own.'],
      sections,
    });

    expect(body).toContain(
      [
        '> A PDF SDK.',
        '',
        'Pages are listed for React.',
        '',
        'Each framework has a file of its own.',
        '',
        '## Start here',
      ].join('\n'),
    );
  });
});
