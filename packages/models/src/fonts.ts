/**
 * Font-related types for EmbedPDF
 *
 * @packageDocumentation
 */

/**
 * Represents a single font file in a font package
 *
 * Used by @embedpdf/fonts-* packages to describe their font files
 */
export interface FontFile {
  /** Font file name (e.g., 'NotoSansJP-Regular.otf') */
  file: string;
  /** Font weight (100-900) */
  weight: number;
  /** Whether this is an italic variant */
  italic?: boolean;
}

/**
 * Metadata for a font package
 *
 * Exported by @embedpdf/fonts-* packages to describe their contents
 */
export interface FontPackageMeta {
  /** Package name (e.g., '@embedpdf/fonts-jp') */
  name: string;
  /** List of font files in this package */
  fonts: FontFile[];
}
