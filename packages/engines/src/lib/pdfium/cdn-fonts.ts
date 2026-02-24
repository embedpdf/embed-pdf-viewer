/**
 * CDN Font Configuration for Browser Environments
 *
 * This file is intentionally separate from font-fallback.ts so that
 * Node.js users don't have to bundle the CDN URLs and font definitions.
 *
 * Only import this in browser-specific code (like the worker).
 */

import { FontCharset, type FontFile } from '@embedpdf/models';
import type { FontFallbackConfig, FontVariant } from './font-fallback';

// Import font definitions from font packages (single source of truth)
import { fonts as jpFonts } from '@embedpdf/fonts-jp';
import { fonts as krFonts } from '@embedpdf/fonts-kr';
import { fonts as scFonts } from '@embedpdf/fonts-sc';
import { fonts as tcFonts } from '@embedpdf/fonts-tc';
import { fonts as arabicFonts } from '@embedpdf/fonts-arabic';
import { fonts as hebrewFonts } from '@embedpdf/fonts-hebrew';
import { fonts as latinFonts } from '@embedpdf/fonts-latin';

// ============================================================================
// CDN URL Builders
// ============================================================================

/**
 * Build CDN URLs from package version
 */
function buildCdnUrls(version: string = 'latest') {
  return {
    jp: `https://cdn.jsdelivr.net/npm/@embedpdf/fonts-jp@${version}/fonts`,
    kr: `https://cdn.jsdelivr.net/npm/@embedpdf/fonts-kr@${version}/fonts`,
    sc: `https://cdn.jsdelivr.net/npm/@embedpdf/fonts-sc@${version}/fonts`,
    tc: `https://cdn.jsdelivr.net/npm/@embedpdf/fonts-tc@${version}/fonts`,
    arabic: `https://cdn.jsdelivr.net/npm/@embedpdf/fonts-arabic@${version}/fonts`,
    hebrew: `https://cdn.jsdelivr.net/npm/@embedpdf/fonts-hebrew@${version}/fonts`,
    latin: `https://cdn.jsdelivr.net/npm/@embedpdf/fonts-latin@${version}/fonts`,
  };
}

/**
 * Convert font files to FontVariant array with base URL
 */
function toFontVariants(fonts: FontFile[], baseUrl: string): FontVariant[] {
  return fonts.map((f) => ({
    url: `${baseUrl}/${f.file}`,
    weight: f.weight,
    italic: f.italic,
  }));
}

/**
 * Build a complete font config from CDN URLs
 */
function buildCdnFontConfig(urls: ReturnType<typeof buildCdnUrls>): FontFallbackConfig {
  return {
    fonts: {
      [FontCharset.SHIFTJIS]: toFontVariants(jpFonts, urls.jp),
      [FontCharset.HANGEUL]: toFontVariants(krFonts, urls.kr),
      [FontCharset.GB2312]: toFontVariants(scFonts, urls.sc),
      [FontCharset.CHINESEBIG5]: toFontVariants(tcFonts, urls.tc),
      [FontCharset.ARABIC]: toFontVariants(arabicFonts, urls.arabic),
      [FontCharset.HEBREW]: toFontVariants(hebrewFonts, urls.hebrew),
      [FontCharset.CYRILLIC]: toFontVariants(latinFonts, urls.latin),
      [FontCharset.GREEK]: toFontVariants(latinFonts, urls.latin),
      [FontCharset.VIETNAMESE]: toFontVariants(latinFonts, urls.latin),
    },
  };
}

// ============================================================================
// Public Exports
// ============================================================================

/**
 * CDN base URLs for EmbedPDF font packages hosted on jsDelivr (using @latest)
 */
export const FONT_CDN_URLS = buildCdnUrls('latest');

/**
 * Default CDN font configuration using @embedpdf/fonts-* packages from jsDelivr
 *
 * This is the default configuration for browser-based worker engines.
 * Fonts are loaded on-demand from jsDelivr when PDFium needs them.
 *
 * Uses @latest to always get the newest version of font packages.
 *
 * Included packages:
 * - @embedpdf/fonts-jp: Japanese (7 weights: Thin to Black)
 * - @embedpdf/fonts-kr: Korean (7 weights: Thin to Black)
 * - @embedpdf/fonts-sc: Simplified Chinese (5 weights: Light to Bold)
 * - @embedpdf/fonts-tc: Traditional Chinese (7 weights: Thin to Black)
 * - @embedpdf/fonts-arabic: Arabic (Regular, Bold)
 * - @embedpdf/fonts-hebrew: Hebrew (Regular, Bold)
 * - @embedpdf/fonts-latin: Latin/Cyrillic/Greek/Vietnamese (9 weights with italics)
 */
export const cdnFontConfig: FontFallbackConfig = buildCdnFontConfig(FONT_CDN_URLS);

/**
 * Create a CDN font config with a specific version
 *
 * Use this if you need to pin to a specific version for stability.
 *
 * @param version - Version string (e.g., '1.0.0', '1', 'latest')
 * @returns FontFallbackConfig with versioned CDN URLs
 *
 * @example
 * ```typescript
 * // Pin to specific version
 * const fontConfig = createCdnFontConfig('1.0.0');
 *
 * // Use major version (recommended for stability)
 * const fontConfig = createCdnFontConfig('1');
 * ```
 */
export function createCdnFontConfig(version: string = 'latest'): FontFallbackConfig {
  return buildCdnFontConfig(buildCdnUrls(version));
}

// Re-export types for convenience
export type { FontFallbackConfig };
