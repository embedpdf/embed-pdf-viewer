/**
 * The viewer's tokens: each is a public `--epdf-*` variable the chrome's stylesheet declares on
 * the viewer's root, with the page's own value read on the host first, and the theme's config
 * turns into declarations of the same variables that still give way to the page's.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { THEME_TOKENS, themeTokenCss } from '../../../chrome/src/ui/theme';

const stylesheet = readFileSync(
  fileURLToPath(new URL('../../../chrome/src/styles.css', import.meta.url)),
  'utf8',
);

/** The declarations of the first rule whose selector is `selector`. */
const ruleOf = (selector: string): string => {
  const start = stylesheet.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return stylesheet.slice(start, stylesheet.indexOf('\n}', start));
};

const ROOT = '[data-embedpdf-root]';

describe("the chrome's stylesheet", () => {
  it('declares every token on the root, the page value first, and reads it on the host', () => {
    const host = ruleOf(':host');
    const root = ruleOf(`:root,\n${ROOT}`);
    for (const name of THEME_TOKENS) {
      expect(host).toContain(`--embedpdf-host-${name}: var(--epdf-${name});`);
      expect(root).toMatch(new RegExp(`--epdf-${name}: var\\(\\s*--embedpdf-host-${name},`));
    }
  });

  it('gives every color its own default in dark', () => {
    const dark = ruleOf('.dark');
    for (const name of THEME_TOKENS.filter((token) => token !== 'radius' && token !== 'font')) {
      expect(dark).toContain(`--epdf-${name}: var(--embedpdf-host-${name},`);
    }
  });

  it('draws with the public tokens only', () => {
    expect(stylesheet).not.toMatch(/--ep-[a-z]/);
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
