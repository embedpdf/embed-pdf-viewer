// ─────────────────────────────────────────────────────────
// Theme System for EmbedPDF Viewer
// ─────────────────────────────────────────────────────────

/**
 * Semantic color tokens for the PDF viewer theme.
 * These are organized by purpose, not by color name.
 */
export interface ThemeColors {
  // ─────────────────────────────────────────────────────────
  // Backgrounds
  // ─────────────────────────────────────────────────────────
  background: {
    /** Main app/viewport background */
    app: string;
    /** Primary surfaces: cards, toolbars, sidebars, modals */
    surface: string;
    /** Secondary/alternate surface: secondary toolbars, subtle sections */
    surfaceAlt: string;
    /** Elevated surfaces: dropdowns, popovers, tooltips */
    elevated: string;
    /** Modal backdrop overlay */
    overlay: string;
    /** Input fields background */
    input: string;
  };

  // ─────────────────────────────────────────────────────────
  // Foreground / Text
  // ─────────────────────────────────────────────────────────
  foreground: {
    /** Primary text - headings, body text */
    primary: string;
    /** Secondary text - less prominent content */
    secondary: string;
    /** Muted text - placeholders, hints, timestamps */
    muted: string;
    /** Disabled text */
    disabled: string;
    /** Text on accent/colored backgrounds */
    onAccent: string;
  };

  // ─────────────────────────────────────────────────────────
  // Borders
  // ─────────────────────────────────────────────────────────
  border: {
    /** Default borders - inputs, cards, dividers */
    default: string;
    /** Subtle borders - section dividers, separators */
    subtle: string;
    /** Strong borders - color swatches, emphasis */
    strong: string;
  };

  // ─────────────────────────────────────────────────────────
  // Accent / Brand colors
  // ─────────────────────────────────────────────────────────
  accent: {
    /** Primary accent - buttons, links, active states */
    primary: string;
    /** Primary hover state */
    primaryHover: string;
    /** Primary active/pressed state */
    primaryActive: string;
    /** Light accent background - selection highlights */
    primaryLight: string;
    /** Text on primary accent background */
    primaryForeground: string;
  };

  // ─────────────────────────────────────────────────────────
  // Interactive states
  // ─────────────────────────────────────────────────────────
  interactive: {
    /** Hover background for interactive elements */
    hover: string;
    /** Active/pressed background */
    active: string;
    /** Selected item background */
    selected: string;
    /** Focus ring color */
    focus: string;
    /** Focus ring (lighter, for offset) */
    focusRing: string;
  };

  // ─────────────────────────────────────────────────────────
  // Semantic states
  // ─────────────────────────────────────────────────────────
  state: {
    /** Error state */
    error: string;
    errorLight: string;
    /** Warning state */
    warning: string;
    warningLight: string;
    /** Success state */
    success: string;
    successLight: string;
    /** Info state */
    info: string;
    infoLight: string;
  };

  // ─────────────────────────────────────────────────────────
  // Component-specific (optional overrides)
  // ─────────────────────────────────────────────────────────
  scrollbar?: {
    track: string;
    thumb: string;
    thumbHover: string;
  };

  tooltip?: {
    background: string;
    foreground: string;
  };
}

/**
 * A complete theme definition
 */
export interface Theme {
  /** Theme identifier */
  name: string;
  /** Color tokens */
  colors: ThemeColors;
}

// ─────────────────────────────────────────────────────────
// Theme Preference (how to select which theme)
// ─────────────────────────────────────────────────────────

export type ThemePreference = 'light' | 'dark' | 'system';

// ─────────────────────────────────────────────────────────
// Theme Configuration
// ─────────────────────────────────────────────────────────

export interface ThemeConfig {
  /**
   * Which theme to use: 'light', 'dark', or 'system' (follows OS)
   * @default 'system'
   */
  preference?: ThemePreference;

  /**
   * Color overrides for light mode.
   * Only specify the colors you want to change.
   * @example { accent: { primary: '#9333ea' } }
   */
  light?: DeepPartial<ThemeColors>;

  /**
   * Color overrides for dark mode.
   * Only specify the colors you want to change.
   * @example { accent: { primary: '#a855f7' } }
   */
  dark?: DeepPartial<ThemeColors>;
}

// ─────────────────────────────────────────────────────────
// Built-in Light Theme
// ─────────────────────────────────────────────────────────

export const lightTheme: Theme = {
  name: 'light',
  colors: {
    background: {
      app: '#f3f4f6', // gray-100
      surface: '#ffffff',
      surfaceAlt: '#f1f3f5',
      elevated: '#ffffff',
      overlay: 'rgba(0, 0, 0, 0.5)',
      input: '#ffffff',
    },
    foreground: {
      primary: '#111827', // gray-900
      secondary: '#374151', // gray-700
      muted: '#6b7280', // gray-500
      disabled: '#9ca3af', // gray-400
      onAccent: '#ffffff',
    },
    border: {
      default: '#d1d5db', // gray-300
      subtle: '#e5e7eb', // gray-200
      strong: '#9ca3af', // gray-400
    },
    accent: {
      primary: '#3b82f6', // blue-500
      primaryHover: '#2563eb', // blue-600
      primaryActive: '#1d4ed8', // blue-700
      primaryLight: '#eff6ff', // blue-50
      primaryForeground: '#ffffff',
    },
    interactive: {
      hover: '#f3f4f6', // gray-100
      active: '#e5e7eb', // gray-200
      selected: '#eff6ff', // blue-50
      focus: '#3b82f6', // blue-500
      focusRing: '#bfdbfe', // blue-200
    },
    state: {
      error: '#ef4444', // red-500
      errorLight: '#fef2f2', // red-50
      warning: '#f59e0b', // amber-500
      warningLight: '#fffbeb', // amber-50
      success: '#22c55e', // green-500
      successLight: '#f0fdf4', // green-50
      info: '#3b82f6', // blue-500
      infoLight: '#eff6ff', // blue-50
    },
    tooltip: {
      background: '#111827', // gray-900
      foreground: '#ffffff',
    },
    scrollbar: {
      track: '#f3f4f6',
      thumb: '#d1d5db',
      thumbHover: '#9ca3af',
    },
  },
};

// ─────────────────────────────────────────────────────────
// Built-in Dark Theme
// ─────────────────────────────────────────────────────────

export const darkTheme: Theme = {
  name: 'dark',
  colors: {
    background: {
      app: '#111827', // gray-900
      surface: '#1f2937', // gray-800
      surfaceAlt: '#374151', // gray-700
      elevated: '#1f2937',
      overlay: 'rgba(0, 0, 0, 0.7)',
      input: '#374151', // gray-700
    },
    foreground: {
      primary: '#f9fafb', // gray-50
      secondary: '#e5e7eb', // gray-200
      muted: '#9ca3af', // gray-400
      disabled: '#6b7280', // gray-500
      onAccent: '#111827', // gray-900
    },
    border: {
      default: '#4b5563', // gray-600
      subtle: '#374151', // gray-700
      strong: '#6b7280', // gray-500
    },
    accent: {
      primary: '#60a5fa', // blue-400
      primaryHover: '#3b82f6', // blue-500
      primaryActive: '#2563eb', // blue-600
      primaryLight: '#1e3a5f', // dark blue tint
      primaryForeground: '#111827',
    },
    interactive: {
      hover: '#374151', // gray-700
      active: '#4b5563', // gray-600
      selected: '#1e3a5f', // dark blue tint
      focus: '#60a5fa', // blue-400
      focusRing: '#1e40af', // blue-800
    },
    state: {
      error: '#f87171', // red-400
      errorLight: '#7f1d1d', // red-900
      warning: '#fbbf24', // amber-400
      warningLight: '#78350f', // amber-900
      success: '#4ade80', // green-400
      successLight: '#14532d', // green-900
      info: '#60a5fa', // blue-400
      infoLight: '#1e3a5f',
    },
    tooltip: {
      background: '#f9fafb', // gray-50
      foreground: '#111827', // gray-900
    },
    scrollbar: {
      track: '#1f2937',
      thumb: '#4b5563',
      thumbHover: '#6b7280',
    },
  },
};

// ─────────────────────────────────────────────────────────
// Utility Types
// ─────────────────────────────────────────────────────────

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ─────────────────────────────────────────────────────────
// Theme Utilities
// ─────────────────────────────────────────────────────────

/**
 * Deep merge utility for nested objects
 */
function deepMerge<T extends Record<string, any>>(target: T, source: DeepPartial<T>): T {
  const result = { ...target } as T;
  for (const key in source) {
    const sourceValue = source[key];
    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      result[key as keyof T] = deepMerge(
        target[key] || ({} as any),
        sourceValue as any,
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key as keyof T] = sourceValue as T[keyof T];
    }
  }
  return result;
}

/**
 * Creates a custom theme by extending a base theme with color overrides
 */
export function createTheme(
  base: Theme,
  overrides: DeepPartial<ThemeColors>,
  name?: string,
): Theme {
  return {
    name: name || `${base.name}-custom`,
    colors: deepMerge(base.colors, overrides),
  };
}

/**
 * Applies color overrides to a base theme
 */
export function resolveTheme(overrides: DeepPartial<ThemeColors> | undefined, base: Theme): Theme {
  if (!overrides) return base;
  return createTheme(base, overrides);
}

// ─────────────────────────────────────────────────────────
// System Preference Detection
// ─────────────────────────────────────────────────────────

/**
 * Detects the user's OS color scheme preference
 */
export function getSystemColorScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Subscribes to OS color scheme changes
 * @returns Cleanup function to unsubscribe
 */
export function onSystemColorSchemeChange(
  callback: (scheme: 'light' | 'dark') => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => callback(e.matches ? 'dark' : 'light');

  mediaQuery.addEventListener('change', handler);
  return () => mediaQuery.removeEventListener('change', handler);
}

/**
 * Resolves the effective color scheme based on preference
 */
export function resolveColorScheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    return getSystemColorScheme();
  }
  return preference;
}

// ─────────────────────────────────────────────────────────
// CSS Custom Properties Generation
// ─────────────────────────────────────────────────────────

/**
 * Converts camelCase to kebab-case
 */
function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Generates CSS custom properties from a theme
 */
export function generateThemeCSS(theme: Theme): string {
  const lines: string[] = [];

  function addVars(obj: Record<string, any>, prefix: string) {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        addVars(value, `${prefix}-${toKebabCase(key)}`);
      } else if (value !== undefined) {
        lines.push(`  --ep${prefix}-${toKebabCase(key)}: ${value};`);
      }
    }
  }

  addVars(theme.colors, '');
  return lines.join('\n');
}

/**
 * Generates the full CSS block for a theme, targeting :host
 */
export function generateThemeStylesheet(theme: Theme): string {
  return `:host {\n${generateThemeCSS(theme)}\n}`;
}
