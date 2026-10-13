/**
 * Light/dark theme — one class, and the CSS variables in styles.css do the
 * rest (both toolbars, sidebars, popovers, and the canvas re-theme from it).
 * The mode follows the embedder's `theme` preference while the viewer runs;
 * `'system'` follows the OS setting, and switches when the user changes it.
 * The class lands on <html> by default; a delivery that must not touch the
 * page (the <embedpdf-viewer> shadow root) passes `target` and the class stays
 * inside its own subtree. The theme's tokens are CSS variables too: a delivery
 * applies {@link themeTokenCss} on the viewer's root.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

// ── tokens ───────────────────────────────────────────────────────────────────

/**
 * The viewer's look, by name: each is the CSS variable `--epdf-<name>`, which the chrome's
 * stylesheet declares with a default for each mode and mixes every other shade from.
 */
export const THEME_TOKENS = [
  'accent',
  'background',
  'surface',
  'surface-raised',
  'text',
  'text-muted',
  'border',
  'hover',
  'canvas',
  'radius',
  'font',
] as const;

/** A token's name: `surface` is the CSS variable `--epdf-surface`. */
export type ThemeToken = (typeof THEME_TOKENS)[number];

/** Token values by name, each a CSS value: `{ surface: '#fbfaf7', radius: '2px' }`. */
export type ThemeTokens = { readonly [Name in ThemeToken]?: string };

export interface ThemeConfig {
  /** 'system' (default) follows the OS. */
  preference?: ThemePreference;
  /** The accent color in both modes: the same as `tokens.accent`, which wins when both are set. */
  accent?: string;
  /** Token values for both modes, over the viewer's defaults. */
  tokens?: ThemeTokens;
  /** Token values for dark mode only, over `tokens`. */
  dark?: ThemeTokens;
}

/** Normalize the shorthand — deliveries use this to read one shape. */
export const themeConfigOf = (theme: ThemePreference | ThemeConfig | undefined): ThemeConfig =>
  typeof theme === 'string' ? { preference: theme } : (theme ?? {});

const isThemeToken = (name: string): name is ThemeToken =>
  (THEME_TOKENS as readonly string[]).includes(name);

/** The declarations of `tokens` that are tokens with a CSS value; each other entry warns. */
function tokenDeclarations(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .filter(([name, value]) => {
      if (value === undefined) return false;
      if (!isThemeToken(name)) {
        console.warn(`[embedpdf] theme: "${name}" isn't a token, ignored`);
        return false;
      }
      if (typeof value !== 'string' || /[{};]/.test(value)) {
        console.warn(`[embedpdf] theme: ignoring the invalid value of "${name}"`);
        return false;
      }
      return true;
    })
    .map(([name, value]) => `--epdf-${name}:var(--embedpdf-host-${name},${value});`)
    .join('');
}

/**
 * The CSS that applies a theme's tokens on the viewer's root (`root`, a selector), for a sheet
 * after the chrome's: its tokens win over the defaults in both modes by coming later, and its
 * dark ones win in dark by naming the class too. A value is a default only: the page's own
 * `--epdf-*` variable still wins, read on the host as the chrome's stylesheet does. Empty when
 * the theme sets no token.
 */
export function themeTokenCss(theme: ThemePreference | ThemeConfig | undefined, root: string) {
  const { accent, tokens, dark } = themeConfigOf(theme);
  const both = tokenDeclarations({ ...(accent === undefined ? null : { accent }), ...tokens });
  const darkOnly = dark ? tokenDeclarations(dark) : '';
  return (both ? `${root}{${both}}` : '') + (darkOnly ? `${root}.dark{${darkOnly}}` : '');
}

const ThemeCtx = createContext<{ mode: ThemeMode } | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

const systemMode = (): ThemeMode =>
  typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';

export function ThemeProvider({
  children,
  preference = 'system',
  target,
}: {
  children: React.ReactNode;
  /** The mode, or 'system' (default) to follow the OS setting. */
  preference?: ThemePreference;
  /** Where the `.dark` class goes. Default: document.documentElement. */
  target?: HTMLElement | null;
}) {
  const [system, setSystem] = useState<ThemeMode>(systemMode);
  useEffect(() => {
    if (preference !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(DARK_QUERY);
    const follow = () => setSystem(query.matches ? 'dark' : 'light');
    follow();
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [preference]);
  const mode = preference === 'system' ? system : preference;
  // Before the paint, so the viewer never shows a frame in the other mode.
  useLayoutEffect(() => {
    (target ?? document.documentElement).classList.toggle('dark', mode === 'dark');
  }, [mode, target]);
  const value = useMemo(() => ({ mode }), [mode]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** The mode the viewer shows now. */
export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
