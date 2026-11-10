/**
 * A package README as text (`readme-text.mjs`): how a frame is filled, and what the check finds
 * in the result.
 *
 *   node --test docs/content/scripts/*.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fillFrame,
  linkProblems,
  proseOf,
  sizeOf,
  tableRows,
  wordingProblems,
} from './readme-text.mjs';

const lines = (...text) => text.join('\n');

const FRAME = lines(
  '# {name}',
  '',
  '{description}',
  '',
  '## {pageTitle}',
  '',
  '{cut}',
  '',
  '## Documentation',
  '',
  '- [{pageTitle}]({pageUrl})',
  '{nextSteps}',
  '',
  '## License',
  '',
  '{license}',
  '',
);

const SLOTS = {
  name: '@embedpdf/react',
  description: 'React components.',
  pageTitle: 'Quick start',
  pageUrl: 'https://www.embedpdf.com/docs/headless/react/quick-start',
  cut: lines('Install it.', '', '', '', '```sh', 'npm install {name}', '```'),
  nextSteps: '- [Setup](https://www.embedpdf.com/docs/headless/react/setup)',
  license: 'Apache-2.0',
};

describe('a frame, filled', () => {
  it('puts each value in as it is, blank lines and braces included', () => {
    assert.equal(
      fillFrame(FRAME, SLOTS),
      lines(
        '# @embedpdf/react',
        '',
        'React components.',
        '',
        '## Quick start',
        '',
        'Install it.',
        '',
        '',
        '',
        '```sh',
        'npm install {name}',
        '```',
        '',
        '## Documentation',
        '',
        '- [Quick start](https://www.embedpdf.com/docs/headless/react/quick-start)',
        '- [Setup](https://www.embedpdf.com/docs/headless/react/setup)',
        '',
        '## License',
        '',
        'Apache-2.0',
        '',
      ),
    );
  });

  it('leaves out a line that is only an empty slot', () => {
    const readme = fillFrame(FRAME, { ...SLOTS, nextSteps: '' });

    assert.ok(readme.includes('quick-start)\n\n## License'));
  });

  it('leaves out a heading with nothing under it', () => {
    const readme = fillFrame(FRAME, { ...SLOTS, cut: '' });

    assert.ok(readme.includes('React components.\n\n## Documentation'));
    assert.ok(!readme.includes('## Quick start'));
    assert.equal(fillFrame('## {name}\n\n### Inside\n\n{cut}\n', { name: 'a', cut: '' }), '\n');
    assert.equal(
      fillFrame('## {name}\n\n### Inside\n\n{cut}\n', { name: 'a', cut: 'b' }),
      '## a\n\n### Inside\n\nb\n',
    );
  });

  it("takes a table's rows under the header the frame has", () => {
    const frame = lines('| Framework | Import from |', '| :-- | :-- |', '{imports}', '');
    const imports = tableRows([
      ['React', '`@embedpdf/react/search`'],
      ['Angular', '`@embedpdf/angular/search`'],
    ]);

    assert.equal(
      fillFrame(frame, { imports }),
      lines(
        '| Framework | Import from |',
        '| :-- | :-- |',
        '| React   | `@embedpdf/react/search`   |',
        '| Angular | `@embedpdf/angular/search` |',
        '',
      ),
    );
  });

  it('fails on a slot it has no value for', () => {
    assert.throws(
      () => fillFrame('{name}\n\n{maintainer}\n', SLOTS),
      /\{maintainer\} has no value/,
    );
  });
});

describe('what the check reads in a README', () => {
  const readme = lines(
    'See [Setup](https://www.embedpdf.com/docs/headless/react/setup) and `a — b`.',
    '',
    '```tsx',
    '// v3 — [not a link](setup)',
    '```',
    '',
    '![The viewer](https://www.embedpdf.com/docs/viewer.png)',
  );

  it('reads the prose, not the code', () => {
    assert.deepEqual(wordingProblems(proseOf(readme)), []);
    assert.deepEqual(wordingProblems('A viewer — for EmbedPDF v3.'), [
      'holds an em-dash',
      'says "v3"',
    ]);
    assert.deepEqual(wordingProblems('The @embedpdf/viewer@3 script, and 3.1.0.'), []);
  });

  it('takes a page of either docs site, by its full URL', () => {
    const routes = new Set(['/docs', '/docs/headless/react/setup']);
    const docsRoutes = (origin) => (origin === 'https://www.embedpdf.com' ? routes : undefined);
    const problems = (markdown) => linkProblems(markdown, docsRoutes);

    assert.deepEqual(problems(readme), []);
    assert.deepEqual(
      problems('[Docs](https://www.embedpdf.com/docs/) [npm](https://npmjs.com/docs/x)'),
      [],
    );
    assert.deepEqual(problems('[Setup](setup) [Zoom](#zoom)'), [
      'setup is not a full URL',
      '#zoom is not a full URL',
    ]);
    assert.deepEqual(problems('[Setup](https://www.embedpdf.com/docs/headless/react/setup.md)'), [
      "https://www.embedpdf.com/docs/headless/react/setup.md is a page's Markdown, not the page",
    ]);
    assert.deepEqual(problems('[Fonts](https://www.embedpdf.com/docs/engine/fonts#subsets)'), [
      'https://www.embedpdf.com/docs/engine/fonts#subsets is no page',
    ]);
  });

  it('says how long a README is, and what code it shows', () => {
    const shown = lines(
      '# A',
      '',
      '```sh',
      'npm install a',
      '```',
      '',
      '**`basic.tsx`**',
      '',
      '```tsx',
      'const a = 1;',
      '',
      'export default a;',
      '```',
      '',
    );

    assert.deepEqual(sizeOf(shown), {
      lines: 13,
      code: [
        { shows: 'sh', lines: 1 },
        { shows: 'basic.tsx', lines: 3 },
      ],
    });
  });
});
