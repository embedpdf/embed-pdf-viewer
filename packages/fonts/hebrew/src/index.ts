/**
 * @embedpdf/fonts-hebrew
 *
 * Hebrew fallback fonts - Noto Sans Hebrew
 * 2 weights: Regular and Bold
 *
 * @packageDocumentation
 */

import type { FontFile, FontPackageMeta } from '@embedpdf/models';

/**
 * Font files included in this package
 */
export const fonts: FontFile[] = [
  { file: 'NotoSansHebrew-Regular.ttf', weight: 400 },
  { file: 'NotoSansHebrew-Bold.ttf', weight: 700 },
];

/**
 * Package metadata
 */
export const fontsMeta: FontPackageMeta = {
  name: '@embedpdf/fonts-hebrew',
  fonts,
};
