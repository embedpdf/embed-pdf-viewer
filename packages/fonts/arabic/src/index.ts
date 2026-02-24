/**
 * @embedpdf/fonts-arabic
 *
 * Arabic fallback fonts - Noto Naskh Arabic
 * 2 weights: Regular and Bold
 *
 * @packageDocumentation
 */

import type { FontFile, FontPackageMeta } from '@embedpdf/models';

/**
 * Font files included in this package
 */
export const fonts: FontFile[] = [
  { file: 'NotoNaskhArabic-Regular.ttf', weight: 400 },
  { file: 'NotoNaskhArabic-Bold.ttf', weight: 700 },
];

/**
 * Package metadata
 */
export const fontsMeta: FontPackageMeta = {
  name: '@embedpdf/fonts-arabic',
  fonts,
};
