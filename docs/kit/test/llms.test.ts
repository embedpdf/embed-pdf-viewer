import { describe, expect, it } from 'vitest';

import { renderLlmsTxt } from '../src/llms';

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
