/**
 * Icon Registry - Framework-agnostic icon registration system
 *
 * Allows users to register custom SVG icons using path data only (safe, no XSS risk).
 * Icons are stored as path configurations and rendered dynamically.
 */
/**
 * Color reference for icon paths.
 * - 'primary'      → uses primaryColor prop (default icon color)
 * - 'secondary'    → uses secondaryColor prop (accent/fill color)
 * - 'currentColor' → inherits from CSS color property
 * - 'none'         → transparent/no color
 * - Any valid CSS color string (e.g., '#ff0000', 'rgb(255,0,0)')
 */
export type IconColor = 'primary' | 'secondary' | 'currentColor' | 'none' | (string & {});
/**
 * Configuration for a single SVG path within an icon
 */
export interface IconPathConfig {
    /** SVG path data (d attribute) */
    d: string;
    /** Stroke color - defaults to 'none' */
    stroke?: IconColor;
    /** Fill color - defaults to 'none' */
    fill?: IconColor;
    /** Override stroke width for this path */
    strokeWidth?: number;
    /** Path opacity (0-1) */
    opacity?: number;
}
/**
 * Configuration for a custom icon
 */
export interface CustomIconConfig {
    /** SVG viewBox - defaults to '0 0 24 24' */
    viewBox?: string;
    /** Array of path configurations */
    paths: IconPathConfig[];
    /** Default stroke-linecap for all paths */
    strokeLinecap?: 'round' | 'butt' | 'square';
    /** Default stroke-linejoin for all paths */
    strokeLinejoin?: 'round' | 'miter' | 'bevel';
    /** Default stroke width for all paths (can be overridden per-path) */
    strokeWidth?: number;
}
/**
 * Shorthand for simple single-path icons
 */
export interface SimpleIconConfig {
    /** SVG viewBox - defaults to '0 0 24 24' */
    viewBox?: string;
    /** SVG path data (d attribute) */
    path: string;
    /** Stroke color - defaults to 'primary' */
    stroke?: IconColor;
    /** Fill color - defaults to 'none' */
    fill?: IconColor;
    /** Default stroke-linecap */
    strokeLinecap?: 'round' | 'butt' | 'square';
    /** Default stroke-linejoin */
    strokeLinejoin?: 'round' | 'miter' | 'bevel';
    /** Stroke width */
    strokeWidth?: number;
}
/**
 * Icon configuration - can be full config or simple shorthand
 */
export type IconConfig = CustomIconConfig | SimpleIconConfig;
/**
 * Map of icon name to configuration
 */
export type IconsConfig = Record<string, IconConfig>;
/**
 * Registers a custom icon
 * @param name - Unique icon name
 * @param config - Icon configuration
 * @throws Error if path data is invalid
 */
export declare function registerIcon(name: string, config: IconConfig): void;
/**
 * Registers multiple icons at once
 * @param icons - Map of icon name to configuration
 */
export declare function registerIcons(icons: IconsConfig): void;
/**
 * Gets a custom icon configuration
 * @param name - Icon name
 * @returns Icon config or undefined if not found
 */
export declare function getCustomIcon(name: string): CustomIconConfig | undefined;
/**
 * Checks if a custom icon exists
 * @param name - Icon name
 */
export declare function hasCustomIcon(name: string): boolean;
/**
 * Removes a custom icon
 * @param name - Icon name
 */
export declare function unregisterIcon(name: string): boolean;
/**
 * Gets all registered custom icon names
 */
export declare function getCustomIconNames(): string[];
/**
 * Clears all custom icons
 */
export declare function clearCustomIcons(): void;
/**
 * Resolves an IconColor to an actual CSS color value
 * @param color - The color reference
 * @param primaryColor - The primary color value
 * @param secondaryColor - The secondary color value
 */
export declare function resolveIconColor(color: IconColor | undefined, primaryColor: string, secondaryColor: string): string;
//# sourceMappingURL=icon-registry.d.ts.map