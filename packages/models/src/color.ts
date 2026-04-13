import { PdfAlphaColor, PdfColor } from './pdf';

/**
 * Web color as hex string (no opacity)
 */
export type WebColor = string;

// === Alpha-aware types (existing) ===

export interface WebAlphaColor {
  color: string;
  opacity: number;
}

// === Color-only conversion functions ===

/**
 * Convert a {@link PdfColor} to a CSS hex color string.
 *
 * @param c - the RGB color from PDFium (0-255 per channel)
 * @returns hex color string in format #RRGGBB
 */
export function pdfColorToWebColor(c: PdfColor): WebColor {
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');

  return `#${toHex(c.red)}${toHex(c.green)}${toHex(c.blue)}`;
}

/**
 * Convert a CSS hex color back to {@link PdfColor}
 *
 * @param color - #RGB, #RRGGBB, or #rrggbb
 */
export function webColorToPdfColor(color: WebColor): PdfColor {
  // Normalise: #abc → #aabbcc
  if (/^#?[0-9a-f]{3}$/i.test(color)) {
    color = color.replace(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i, '#$1$1$2$2$3$3').toLowerCase();
  }

  const [, r, g, b] =
    /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color) ??
    (() => {
      throw new Error(`Invalid hex colour: "${color}"`);
    })();

  return {
    red: parseInt(r, 16),
    green: parseInt(g, 16),
    blue: parseInt(b, 16),
  };
}

/**
 * Return `#fff` or `#000` as a contrasting stroke color for the given fill color,
 * based on relative luminance (threshold 0.45).
 */
export function getContrastStrokeColor(fillColor: string): string {
  try {
    const { red, green, blue } = webColorToPdfColor(fillColor);
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    return luminance < 0.45 ? '#fff' : '#000';
  } catch {
    return '#000';
  }
}

// === Alpha utility functions ===

/**
 * Convert PDF alpha (0-255) to web opacity (0-1)
 */
export function pdfAlphaToWebOpacity(alpha: number): number {
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  return clamp(alpha) / 255;
}

/**
 * Convert web opacity (0-1) to PDF alpha (0-255)
 */
export function webOpacityToPdfAlpha(opacity: number): number {
  const clamp = (n: number, hi = 255) => Math.max(0, Math.min(hi, n));
  return clamp(Math.round(opacity * 255));
}

/**
 * Extract color part from {@link PdfAlphaColor}
 */
export function extractPdfColor(c: PdfAlphaColor): PdfColor {
  return { red: c.red, green: c.green, blue: c.blue };
}

/**
 * Extract alpha from {@link PdfAlphaColor} as web opacity
 */
export function extractWebOpacity(c: PdfAlphaColor): number {
  return pdfAlphaToWebOpacity(c.alpha);
}

/**
 * Combine {@link PdfColor} and alpha to create {@link PdfAlphaColor}
 */
export function combinePdfColorWithAlpha(color: PdfColor, alpha: number): PdfAlphaColor {
  return { ...color, alpha };
}

/**
 * Combine {@link WebColor} and opacity to create {@link WebAlphaColor}
 */
export function combineWebColorWithOpacity(color: WebColor, opacity: number): WebAlphaColor {
  return { color, opacity };
}

// === Existing alpha-aware functions (kept for backward compatibility) ===

/**
 * Convert a {@link PdfAlphaColor} to a CSS-style colour definition.
 *
 * @param c - the colour coming from PDFium (0-255 per channel)
 * @returns
 *   hex   – #RRGGBB (no alpha channel)
 *   opacity – 0-1 float suitable for CSS `opacity`/`rgba()`
 */
export function pdfAlphaColorToWebAlphaColor(c: PdfAlphaColor): WebAlphaColor {
  const color = pdfColorToWebColor(extractPdfColor(c));
  const opacity = extractWebOpacity(c);
  return { color, opacity };
}

/**
 * Convert a CSS hex colour + opacity back into {@link PdfAlphaColor}
 *
 * @param hex      - #RGB, #RRGGBB, or #rrggbb
 * @param opacity  - 0-1 float (values outside clamp automatically)
 */
export function webAlphaColorToPdfAlphaColor({ color, opacity }: WebAlphaColor): PdfAlphaColor {
  const pdfColor = webColorToPdfColor(color);
  const alpha = webOpacityToPdfAlpha(opacity);
  return combinePdfColorWithAlpha(pdfColor, alpha);
}
