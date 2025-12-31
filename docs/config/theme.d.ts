/**
 * Semantic color tokens for the PDF viewer theme.
 * These are organized by purpose, not by color name.
 */
export interface ThemeColors {
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
    border: {
        /** Default borders - inputs, cards, dividers */
        default: string;
        /** Subtle borders - section dividers, separators */
        subtle: string;
        /** Strong borders - color swatches, emphasis */
        strong: string;
    };
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
 * A complete theme definition (internal use)
 */
export interface Theme {
    /** Color tokens */
    colors: ThemeColors;
}
export type ThemePreference = 'light' | 'dark' | 'system';
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
export declare const lightTheme: Theme;
export declare const darkTheme: Theme;
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
/**
 * Creates a custom theme by extending a base theme with color overrides
 */
export declare function createTheme(base: Theme, overrides: DeepPartial<ThemeColors>): Theme;
/**
 * Applies color overrides to a base theme
 */
export declare function resolveTheme(overrides: DeepPartial<ThemeColors> | undefined, base: Theme): Theme;
/**
 * Detects the user's OS color scheme preference
 */
export declare function getSystemColorScheme(): 'light' | 'dark';
/**
 * Subscribes to OS color scheme changes
 * @returns Cleanup function to unsubscribe
 */
export declare function onSystemColorSchemeChange(callback: (scheme: 'light' | 'dark') => void): () => void;
/**
 * Resolves the effective color scheme based on preference
 */
export declare function resolveColorScheme(preference: ThemePreference): 'light' | 'dark';
/**
 * Generates CSS custom properties from a theme
 */
export declare function generateThemeCSS(theme: Theme): string;
/**
 * Generates the full CSS block for a theme, targeting :host
 */
export declare function generateThemeStylesheet(theme: Theme): string;
//# sourceMappingURL=theme.d.ts.map