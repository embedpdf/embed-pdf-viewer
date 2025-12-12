/**
 * Icon Registry - Framework-agnostic icon registration system
 *
 * Allows users to register custom SVG icons using path data only (safe, no XSS risk).
 * Icons are stored as path configurations and rendered dynamically.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────

/** Global registry for custom icons */
const customIcons = new Map<string, CustomIconConfig>();

/**
 * Regex pattern for valid SVG path commands
 * Only allows: M, m, Z, z, L, l, H, h, V, v, C, c, S, s, Q, q, T, t, A, a
 * and numbers, spaces, commas, dots, minus signs
 */
const VALID_PATH_PATTERN = /^[MmZzLlHhVvCcSsQqTtAa0-9\s,.\-eE]+$/;

/**
 * Validates that a path string only contains safe SVG path commands
 */
function isValidPath(path: string): boolean {
  return VALID_PATH_PATTERN.test(path.trim());
}

/**
 * Normalizes icon config to full CustomIconConfig format
 */
function normalizeConfig(config: IconConfig): CustomIconConfig {
  // Check if it's a simple config (has 'path' property)
  if ('path' in config) {
    return {
      viewBox: config.viewBox || '0 0 24 24',
      paths: [
        {
          d: config.path,
          stroke: config.stroke ?? 'primary',
          fill: config.fill ?? 'none',
          strokeWidth: config.strokeWidth,
        },
      ],
      strokeLinecap: config.strokeLinecap || 'round',
      strokeLinejoin: config.strokeLinejoin || 'round',
      strokeWidth: config.strokeWidth,
    };
  }

  // It's already a full config
  return {
    viewBox: config.viewBox || '0 0 24 24',
    paths: config.paths,
    strokeLinecap: config.strokeLinecap || 'round',
    strokeLinejoin: config.strokeLinejoin || 'round',
    strokeWidth: config.strokeWidth,
  };
}

/**
 * Registers a custom icon
 * @param name - Unique icon name
 * @param config - Icon configuration
 * @throws Error if path data is invalid
 */
export function registerIcon(name: string, config: IconConfig): void {
  const normalized = normalizeConfig(config);

  // Validate all paths
  for (let i = 0; i < normalized.paths.length; i++) {
    const path = normalized.paths[i];
    if (!path.d || !isValidPath(path.d)) {
      throw new Error(
        `Invalid path data for icon "${name}" at path index ${i}. ` +
          `Path must only contain valid SVG path commands.`,
      );
    }
  }

  customIcons.set(name, normalized);
}

/**
 * Registers multiple icons at once
 * @param icons - Map of icon name to configuration
 */
export function registerIcons(icons: IconsConfig): void {
  for (const [name, config] of Object.entries(icons)) {
    registerIcon(name, config);
  }
}

/**
 * Gets a custom icon configuration
 * @param name - Icon name
 * @returns Icon config or undefined if not found
 */
export function getCustomIcon(name: string): CustomIconConfig | undefined {
  return customIcons.get(name);
}

/**
 * Checks if a custom icon exists
 * @param name - Icon name
 */
export function hasCustomIcon(name: string): boolean {
  return customIcons.has(name);
}

/**
 * Removes a custom icon
 * @param name - Icon name
 */
export function unregisterIcon(name: string): boolean {
  return customIcons.delete(name);
}

/**
 * Gets all registered custom icon names
 */
export function getCustomIconNames(): string[] {
  return Array.from(customIcons.keys());
}

/**
 * Clears all custom icons
 */
export function clearCustomIcons(): void {
  customIcons.clear();
}

// ─────────────────────────────────────────────────────────────
// Color Resolution
// ─────────────────────────────────────────────────────────────

/**
 * Resolves an IconColor to an actual CSS color value
 * @param color - The color reference
 * @param primaryColor - The primary color value
 * @param secondaryColor - The secondary color value
 */
export function resolveIconColor(
  color: IconColor | undefined,
  primaryColor: string,
  secondaryColor: string,
): string {
  if (!color || color === 'none') return 'none';
  if (color === 'primary') return primaryColor;
  if (color === 'secondary') return secondaryColor;
  if (color === 'currentColor') return 'currentColor';
  // It's a fixed color string
  return color;
}
