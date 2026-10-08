/**
 * A PostCSS step for the stylesheets the element adopts into its shadow root:
 * every sheet this package imports as a string (`?inline`). Two things a
 * Tailwind sheet relies on don't hold there:
 *
 *   - Browsers ignore `@property` inside a shadow root, so a registered
 *     property never gets its initial value, and every utility that reads one
 *     draws nothing (`border-*` reads `--tw-border-style`; shadows and rings
 *     read others). Tailwind writes the same defaults as plain declarations for
 *     browsers without `@property`, behind an `@supports` that only those match;
 *     here every browser is one, so the guard goes.
 *   - `rem` follows the page's `html { font-size }`. Every `rem` becomes px
 *     at 16px each, so the viewer has the same size on every page.
 */

import type { CSSOptions } from 'vite';

// PostCSS's own types, reached through Vite's, which this package depends on.
type PostcssOptions = Exclude<CSSOptions['postcss'], string | undefined>;
type AcceptedPlugin = NonNullable<PostcssOptions['plugins']>[number];
type PostcssPlugin = Exclude<
  Extract<AcceptedPlugin, { postcssPlugin: string }>,
  (...args: never[]) => unknown
>;
type CssRoot = Parameters<NonNullable<PostcssPlugin['OnceExit']>>[0];

const PX_PER_REM = 16;

// Strings and url()s are copied as they are; only the CSS between them is converted.
const VERBATIM = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\([^)]*\))/gi;
// A number with the `rem` unit, not part of a longer name (`--x-2rem` stays).
const REM = /(^|[^\w.-])(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)rem(?![\w-])/gi;

/** `value` with every `rem` length in px. */
export function remToPx(value: string): string {
  return value
    .split(VERBATIM)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(REM, (_match, before: string, number: string) => {
            const px = Math.round(Number(number) * PX_PER_REM * 1e4) / 1e4;
            return `${before}${px}px`;
          }),
    )
    .join('');
}

/**
 * Apply Tailwind's `@property` defaults unconditionally: its `@layer properties`
 * holds them inside an `@supports`, which is unwrapped. Their values are
 * written for an unregistered property (`0px`, where a registration may say
 * `0`), so they are used as they are. A registered property left without a
 * default fails the build rather than drawing nothing.
 */
function applyPropertyDefaults(root: CssRoot): void {
  const declared = new Set<string>();
  const registered: string[] = [];
  root.walkAtRules((rule) => {
    if (rule.name === 'property') registered.push(rule.params.trim());
    if (rule.name !== 'layer' || rule.params.trim() !== 'properties') return;
    rule.walkAtRules((guard) => {
      if (guard.name === 'supports') guard.replaceWith(guard.nodes ?? []);
    });
    rule.walkDecls((declaration) => {
      declared.add(declaration.prop);
    });
  });
  const missing = registered.filter((name) => !declared.has(name));
  if (missing.length) {
    throw new Error(
      `[embedpdf] the shadow-root stylesheet registers ${missing.join(', ')} with @property ` +
        'but declares no default in `@layer properties`; inside a shadow root it would have none.',
    );
  }
}

export function shadowStylesheet(): PostcssPlugin {
  return {
    postcssPlugin: 'embedpdf-shadow-stylesheet',
    OnceExit(root, { result }) {
      if (!/[?&]inline\b/.test(result.opts.from ?? '')) return;
      applyPropertyDefaults(root);
      root.walkDecls((declaration) => {
        const value = remToPx(declaration.value);
        if (value !== declaration.value) declaration.value = value;
      });
      root.walkAtRules((rule) => {
        const params = remToPx(rule.params);
        if (params !== rule.params) rule.params = params;
      });
    },
  };
}
