import { describe, expect, it } from 'vitest';

import type { AstNode } from '../src/docs-markdown';
import { VISIBLE_ROWS } from '../src/og/panel';
import { selectOgSnippet, snippetFromFrontmatter } from '../src/og/snippet';

const code = (lang: string | null, value: string): AstNode => ({ type: 'code', lang, value });
const para = (text: string): AstNode => ({
  type: 'paragraph',
  children: [{ type: 'strong', children: [{ type: 'inlineCode', value: text }] }],
});
const root = (...children: AstNode[]): AstNode => ({ type: 'root', children });

describe('selectOgSnippet', () => {
  it('takes the first code block that fits whole', () => {
    const tree = root(
      { type: 'paragraph', children: [{ type: 'text', value: 'prose' }] },
      code('ts', 'const a = 1;'),
      code('ts', 'const b = 2;'),
    );
    expect(selectOgSnippet(tree, 'text')?.code).toBe('const a = 1;');
  });

  /**
   * The behaviour that gives plugin pages a real card: their first block is a
   * whole sample file, and the useful one is further down the page.
   */
  it('walks past an oversized block to a later one that fits', () => {
    const tree = root(
      code('tsx', Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')),
      code('ts', 'selection.select({ pon, start, count });'),
    );
    expect(selectOgSnippet(tree, 'selection')?.code).toBe(
      'selection.select({ pon, start, count });',
    );
  });

  it('finds code nested inside other nodes', () => {
    const tree = root({ type: 'section', children: [code('ts', 'const a = 1;')] });
    expect(selectOgSnippet(tree, 'text')?.code).toBe('const a = 1;');
  });

  it('names the file from the projected sample heading when there is one', () => {
    const tree = root(para('App.tsx'), code('tsx', 'export default App;'));
    expect(selectOgSnippet(tree, 'stage')?.filename).toBe('App.tsx');
  });

  it('otherwise names the file from the page and the fence spelling', () => {
    expect(selectOgSnippet(root(code('ts', 'const a = 1;')), 'text')?.filename).toBe('text.ts');
    expect(selectOgSnippet(root(code('tsx', '<App />')), 'stage')?.filename).toBe('stage.tsx');
    expect(selectOgSnippet(root(code('sh', 'npm i x')), 'getting-started')?.filename).toBe(
      'install.sh',
    );
  });

  /** The panel clips rather than wraps, so width is not a fitting concern. */
  it('accepts a short block with very wide lines', () => {
    const wide = Array.from({ length: 4 }, () => 'x'.repeat(110)).join('\n');
    expect(selectOgSnippet(root(code('ts', wide)), 'text')?.code).toBe(wide);
  });

  /**
   * Satori answers a missing glyph by downloading a font, turning a static
   * build into a network call. Pages with box-drawing diagrams in a fence hit
   * exactly that, so those blocks are not candidates.
   */
  it('skips a block needing glyphs the embedded faces lack', () => {
    const art = ['+--------+', '\u2502 box    \u2502', '\u2514--------\u2518'].join('\n');
    const tree = root(code('text', art), code('ts', 'const a = 1;'));
    expect(selectOgSnippet(tree, 'how-it-works')?.code).toBe('const a = 1;');
  });

  it('returns nothing when every block needs glyphs we lack', () => {
    expect(selectOgSnippet(root(code('text', '\u2502\u25BC\u2500')), 'how-it-works')).toBeNull();
  });

  it('accepts a block exactly as tall as the panel', () => {
    const tall = Array.from({ length: VISIBLE_ROWS }, (_, i) => `step(${i});`).join('\n');
    expect(selectOgSnippet(root(code('ts', tall)), 'text')?.code).toBe(tall);
  });

  it('prefers a fitting block over a taller one that appears first', () => {
    const tall = Array.from({ length: VISIBLE_ROWS + 1 }, (_, i) => `step(${i});`).join('\n');
    const tree = root(code('ts', tall), code('ts', 'const a = 1;'));
    expect(selectOgSnippet(tree, 'text')?.code).toBe('const a = 1;');
  });

  /**
   * What the panel's bottom fade buys: too much code is no longer a reason to
   * drop the panel. It is shown from its start and fades out, which reads as
   * continuing rather than truncated.
   */
  it('falls back to the first block when none fits, for the card to fade', () => {
    const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const tree = root(code('tsx', long), code('tsx', `${long}\nmore`));
    expect(selectOgSnippet(tree, 'render')?.code).toBe(long);
  });

  it('falls back to a prefix, never a middle slice', () => {
    const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const picked = selectOgSnippet(root(code('tsx', long)), 'render');
    expect(picked?.code.startsWith('line 0')).toBe(true);
  });

  it('returns nothing for a page with no code at all', () => {
    expect(selectOgSnippet(root(para('nope')), 'plugins')).toBeNull();
  });
});

describe('snippetFromFrontmatter', () => {
  it('accepts the object form', () => {
    expect(
      snippetFromFrontmatter(
        { code: 'const { commit } = useAnnotation()', lang: 'tsx', filename: 'Viewer.tsx' },
        'annotation',
      ),
    ).toEqual({
      code: 'const { commit } = useAnnotation()',
      lang: 'tsx',
      filename: 'Viewer.tsx',
    });
  });

  it('names the file from the page when the object omits one', () => {
    expect(snippetFromFrontmatter({ code: 'const a = 1;', lang: 'ts' }, 'text')?.filename).toBe(
      'text.ts',
    );
  });

  it('accepts a bare string', () => {
    expect(snippetFromFrontmatter('npm i @embedpdf/engine', 'getting-started')).toEqual({
      code: 'npm i @embedpdf/engine',
      lang: null,
      filename: 'getting-started',
    });
  });

  it('ignores an absent or malformed value', () => {
    expect(snippetFromFrontmatter(undefined, 'text')).toBeNull();
    expect(snippetFromFrontmatter('   ', 'text')).toBeNull();
    expect(snippetFromFrontmatter({ lang: 'ts' }, 'text')).toBeNull();
  });
});
