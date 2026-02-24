/**
 * @embedpdf/fonts-latin
 *
 * Latin/European fallback fonts - Noto Sans
 * Full set: 9 weights × 2 styles (regular + italic) = 18 variants
 * Covers: Latin, Cyrillic, Greek, Vietnamese, and more
 *
 * @packageDocumentation
 */

import type { FontFile, FontPackageMeta } from '@embedpdf/models';

/**
 * Font files included in this package
 */
export const fonts: FontFile[] = [
  // Thin (100)
  { file: 'NotoSans-Thin.ttf', weight: 100 },
  { file: 'NotoSans-ThinItalic.ttf', weight: 100, italic: true },
  // ExtraLight (200)
  { file: 'NotoSans-ExtraLight.ttf', weight: 200 },
  { file: 'NotoSans-ExtraLightItalic.ttf', weight: 200, italic: true },
  // Light (300)
  { file: 'NotoSans-Light.ttf', weight: 300 },
  { file: 'NotoSans-LightItalic.ttf', weight: 300, italic: true },
  // Regular (400)
  { file: 'NotoSans-Regular.ttf', weight: 400 },
  { file: 'NotoSans-Italic.ttf', weight: 400, italic: true },
  // Medium (500)
  { file: 'NotoSans-Medium.ttf', weight: 500 },
  { file: 'NotoSans-MediumItalic.ttf', weight: 500, italic: true },
  // SemiBold (600)
  { file: 'NotoSans-SemiBold.ttf', weight: 600 },
  { file: 'NotoSans-SemiBoldItalic.ttf', weight: 600, italic: true },
  // Bold (700)
  { file: 'NotoSans-Bold.ttf', weight: 700 },
  { file: 'NotoSans-BoldItalic.ttf', weight: 700, italic: true },
  // ExtraBold (800)
  { file: 'NotoSans-ExtraBold.ttf', weight: 800 },
  { file: 'NotoSans-ExtraBoldItalic.ttf', weight: 800, italic: true },
  // Black (900)
  { file: 'NotoSans-Black.ttf', weight: 900 },
  { file: 'NotoSans-BlackItalic.ttf', weight: 900, italic: true },
];

/**
 * Package metadata
 */
export const fontsMeta: FontPackageMeta = {
  name: '@embedpdf/fonts-latin',
  fonts,
};
