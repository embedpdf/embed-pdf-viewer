import { describe, expect, it } from 'vitest';

import {
  resolveDocsTreeWith,
  stringifyDocsTree,
  type DocsMarkdownSite,
} from '../src/docs-markdown';

const site: DocsMarkdownSite = {
  siteOrigin: 'https://docs.example',
  engine: 'local',
  resolveExampleFiles: () => undefined,
  readCodeFile: () => null,
  isFramework: () => false,
};

const markdownOf = (sourceCode: string) =>
  stringifyDocsTree(resolveDocsTreeWith(site, { sourceCode }));

describe('<ThemeTokens> in Markdown', () => {
  it('is the token table: name, what it colors, and the light and dark defaults', () => {
    const markdown = markdownOf(`
<ThemeTokens>
  <ThemeToken name="accent" light="#3b82f6" dark="#60a5fa">
    Pressed buttons, [primary](/docs/viewer/layout) buttons and
    focus rings
  </ThemeToken>
  <ThemeToken name="radius" kind="radius" value="6px">
    The corners
  </ThemeToken>
  <ThemeToken name="tooltip" follows="text" default="\`text\`'s color">
    Behind a tooltip's words
  </ThemeToken>
</ThemeTokens>
`);

    const rows = markdown
      .trim()
      .split('\n')
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
    expect(rows[0]).toEqual(['Token', 'What it colors', 'Light', 'Dark']);
    expect(rows[1].every((cell) => /^:-+$/.test(cell))).toBe(true);
    expect(rows.slice(2)).toEqual([
      [
        '`accent`',
        // Wrapped in the source, one line in the cell.
        'Pressed buttons, [primary](https://docs.example/docs/viewer/layout) buttons and focus rings',
        '`#3b82f6`',
        '`#60a5fa`',
      ],
      ['`radius`', 'The corners', '`6px`', '`6px`'],
      ['`tooltip`', "Behind a tooltip's words", "`text`'s color", "`text`'s color"],
    ]);
  });
});
