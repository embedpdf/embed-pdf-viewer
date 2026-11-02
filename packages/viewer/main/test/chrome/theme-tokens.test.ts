/**
 * The viewer's tokens: each is a public `--epdf-*` variable the chrome's stylesheet declares on
 * the viewer's root, with the page's own value read on the host first, and the theme's config
 * turns into declarations of the same variables that still give way to the page's. The Theming
 * page lists each one with the defaults the stylesheet declares.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EPDF_VARIABLES } from '../../../../framework/web/src/theme';
import { THEME_TOKENS, themeTokenCss, type ThemeToken } from '../../../chrome/src/ui/theme';

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const stylesheet = read('../../../chrome/src/styles.css');
const themingPage = read('../../../../../docs/content/viewer/customize/theming.mdx');

/** The declarations of the first rule whose selector is `selector`. */
const ruleOf = (selector: string): string => {
  const start = stylesheet.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return stylesheet.slice(start, stylesheet.indexOf('\n}', start));
};

/** The default a rule gives a token on one line, or undefined when it gives none there. */
const defaultIn = (rule: string, name: string): string | undefined =>
  rule.match(new RegExp(`--epdf-${name}: var\\(--embedpdf-host-${name}, (.+)\\);`))?.[1];

const ROOT = '[data-embedpdf-root]';

/** The tokens that look the same in light and dark: the dark rule leaves them to the root's. */
const SAME_IN_BOTH_MODES: readonly ThemeToken[] = [
  'page-background',
  'page-shadow',
  'radius',
  'font',
];

/** The Theming page's token table: each row's token, and its light and dark defaults when they're code. */
function tokenTable() {
  const section = themingPage.slice(
    themingPage.indexOf('## Every color'),
    themingPage.indexOf('## From CSS'),
  );
  const code = (cell: string | undefined) =>
    cell && /^`[^`]+`$/.test(cell) ? cell.slice(1, -1) : null;
  return section
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => {
      const [token, , light, dark] = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      return { name: code(token), light: code(light), dark: code(dark) };
    });
}

describe("the chrome's stylesheet", () => {
  it('declares every token on the root, the page value first, and reads it on the host', () => {
    const host = ruleOf(':host');
    const root = ruleOf(`:root,\n${ROOT}`);
    for (const name of THEME_TOKENS) {
      expect(host).toContain(`--embedpdf-host-${name}: var(--epdf-${name});`);
      expect(root).toMatch(new RegExp(`--epdf-${name}: var\\(\\s*--embedpdf-host-${name},`));
    }
  });

  it('gives every color its own default in dark, but the corners, the font and the pages', () => {
    const dark = ruleOf('.dark');
    for (const name of THEME_TOKENS) {
      if (SAME_IN_BOTH_MODES.includes(name)) expect(dark).not.toContain(`--epdf-${name}:`);
      else expect(dark).toContain(`--epdf-${name}: var(--embedpdf-host-${name},`);
    }
  });

  it("paints the pages as the Stage's own defaults do, until a theme sets them", () => {
    const root = ruleOf(`:root,\n${ROOT}`);
    for (const name of ['page-background', 'page-shadow'] as const) {
      expect(defaultIn(root, name), name).toBe(EPDF_VARIABLES[name].default);
    }
  });

  it('draws with the public tokens only', () => {
    expect(stylesheet).not.toMatch(/--ep-[a-z]/);
  });
});

describe('the Theming page', () => {
  it('lists every token, with the defaults the stylesheet declares for each mode', () => {
    const rows = tokenTable();
    expect(rows.map((row) => row.name).sort()).toEqual([...THEME_TOKENS].sort());
    const root = ruleOf(`:root,\n${ROOT}`);
    const dark = ruleOf('.dark');
    for (const row of rows) {
      const name = row.name!;
      if (row.light !== null) expect(defaultIn(root, name), `${name} in light`).toBe(row.light);
      if (row.dark !== null) {
        expect(defaultIn(dark, name) ?? defaultIn(root, name), `${name} in dark`).toBe(row.dark);
      }
    }
  });
});

describe('themeTokenCss', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is empty without tokens', () => {
    expect(themeTokenCss('dark', ROOT)).toBe('');
    expect(themeTokenCss({ preference: 'light' }, ROOT)).toBe('');
    expect(themeTokenCss(undefined, ROOT)).toBe('');
  });

  it("sets each token as a default the page's own variable wins over", () => {
    expect(themeTokenCss({ tokens: { surface: '#fbfaf7', radius: '2px' } }, ROOT)).toBe(
      `${ROOT}{--epdf-surface:var(--embedpdf-host-surface,#fbfaf7);` +
        '--epdf-radius:var(--embedpdf-host-radius,2px);}',
    );
  });

  it('takes the accent as a token, which tokens.accent overrides', () => {
    expect(themeTokenCss({ accent: '#7c3aed' }, ROOT)).toBe(
      `${ROOT}{--epdf-accent:var(--embedpdf-host-accent,#7c3aed);}`,
    );
    expect(themeTokenCss({ accent: '#7c3aed', tokens: { accent: '#0f6e56' } }, ROOT)).toBe(
      `${ROOT}{--epdf-accent:var(--embedpdf-host-accent,#0f6e56);}`,
    );
  });

  it('puts the dark tokens under the dark class', () => {
    expect(themeTokenCss({ accent: '#0f6e56', dark: { surface: '#16201c' } }, ROOT)).toBe(
      `${ROOT}{--epdf-accent:var(--embedpdf-host-accent,#0f6e56);}` +
        `${ROOT}.dark{--epdf-surface:var(--embedpdf-host-surface,#16201c);}`,
    );
  });

  it('puts the light tokens on the root without the dark class', () => {
    expect(themeTokenCss({ light: { canvas: '#ebe8e1' } }, ROOT)).toBe(
      `${ROOT}:not(.dark){--epdf-canvas:var(--embedpdf-host-canvas,#ebe8e1);}`,
    );
  });

  it('writes both modes, then light, then dark: a mode wins over tokens by naming its class', () => {
    expect(
      themeTokenCss(
        {
          accent: '#7c3aed',
          tokens: { surface: '#fbfaf7' },
          light: { surface: '#fffdf5', 'page-shadow': 'none' },
          dark: { surface: '#16201c' },
        },
        ROOT,
      ),
    ).toBe(
      `${ROOT}{--epdf-accent:var(--embedpdf-host-accent,#7c3aed);` +
        '--epdf-surface:var(--embedpdf-host-surface,#fbfaf7);}' +
        `${ROOT}:not(.dark){--epdf-surface:var(--embedpdf-host-surface,#fffdf5);` +
        '--epdf-page-shadow:var(--embedpdf-host-page-shadow,none);}' +
        `${ROOT}.dark{--epdf-surface:var(--embedpdf-host-surface,#16201c);}`,
    );
  });

  it('takes the page tokens like any other', () => {
    expect(
      themeTokenCss(
        { tokens: { 'page-background': '#fafaf9', 'page-shadow': '0 1px 3px rgb(0 0 0 / 0.3)' } },
        ROOT,
      ),
    ).toBe(
      `${ROOT}{--epdf-page-background:var(--embedpdf-host-page-background,#fafaf9);` +
        '--epdf-page-shadow:var(--embedpdf-host-page-shadow,0 1px 3px rgb(0 0 0 / 0.3));}',
    );
  });

  it('warns about the light and dark entries as about the others', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(themeTokenCss({ light: { shadow: 'none' } as never, dark: { text: '}' } }, ROOT)).toBe(
      '',
    );
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]![0])).toContain('"shadow"');
    expect(String(warn.mock.calls[1]![0])).toContain('"text"');
  });

  it('warns about a name that is no token, and a value that would end the rule, and skips both', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tokens = { fg: '#000', text: 'red;}*{color:red', canvas: '#eee' };
    expect(themeTokenCss({ tokens: tokens as never }, ROOT)).toBe(
      `${ROOT}{--epdf-canvas:var(--embedpdf-host-canvas,#eee);}`,
    );
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]![0])).toContain('"fg"');
    expect(String(warn.mock.calls[1]![0])).toContain('"text"');
  });
});
