/**
 * The shadow-root step on the chrome's stylesheet, run through Vite's own CSS
 * pipeline with the input shaped like Tailwind's output.
 */
import { preprocessCSS, resolveConfig, type ResolvedConfig } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

import { remToPx, shadowStylesheet } from '../../build/shadow-stylesheet';

let config: ResolvedConfig;
beforeAll(async () => {
  config = await resolveConfig(
    { configFile: false, logLevel: 'silent', css: { postcss: { plugins: [shadowStylesheet()] } } },
    'build',
  );
});

const compile = async (css: string, file = '/viewer/styles.css?inline') =>
  (await preprocessCSS(css, file, config)).code;

// Tailwind's output in shape: defaults for browsers without @property behind a guard, then the
// registrations (whose initial values a minifier may shorten, `0` for `0px`).
const GUARD = '(((-webkit-hyphens:none)) and (not (margin-trim:inline)))';
const TAILWIND_LIKE = [
  `@layer properties{@supports ${GUARD}{*,:before,:after,::backdrop{`,
  '--tw-border-style:solid;--tw-ring-offset-width:0px}}}',
  '@layer theme,base,components,utilities;',
  '@layer utilities{.border-b{border-bottom-style:var(--tw-border-style);border-bottom-width:1px}}',
  '@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}',
  '@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0}',
].join('');

describe('shadowStylesheet', () => {
  it("applies Tailwind's @property defaults without their guard, which @property can't do in a shadow root", async () => {
    const code = await compile(TAILWIND_LIKE);
    expect(code).toContain(
      '@layer properties{*,:before,:after,::backdrop{--tw-border-style:solid;--tw-ring-offset-width:0px}}',
    );
    expect(code).not.toContain('@supports');
    // The registrations themselves stay.
    expect(code).toContain('@property --tw-border-style');
  });

  it('fails the build for a registered property that has no default', async () => {
    await expect(compile('@property --tw-rotate-x{syntax:"*";inherits:false}')).rejects.toThrow(
      /--tw-rotate-x/,
    );
  });

  it('turns every rem into px at 16px, in values and in conditions', async () => {
    const code = await compile(
      ':host{--spacing:.25rem;--text-sm:.875rem}' +
        '.p{padding:calc(var(--spacing)*4) -1.5rem}' +
        '@media (width>=40rem){.w{max-width:24rem}}',
    );
    expect(code).toContain('--spacing:4px;--text-sm:14px');
    expect(code).toContain('padding:calc(var(--spacing)*4) -24px');
    expect(code).toContain('@media (width>=640px){.w{max-width:384px}}');
    expect(code).not.toMatch(/\drem/);
  });

  it('leaves a stylesheet that is not adopted into the shadow root alone', async () => {
    const code = await compile(TAILWIND_LIKE, '/viewer/page.css');
    expect(code).toBe(TAILWIND_LIKE);
  });
});

describe('remToPx', () => {
  it('converts lengths and nothing that merely contains "rem"', () => {
    expect(remToPx('1rem 2.5rem .0625rem -0.5rem')).toBe('16px 40px 1px -8px');
    expect(remToPx('var(--gap-2rem) 1remx')).toBe('var(--gap-2rem) 1remx');
    expect(remToPx('"2rem" url(icon-1rem.svg) 1rem')).toBe('"2rem" url(icon-1rem.svg) 16px');
  });
});
