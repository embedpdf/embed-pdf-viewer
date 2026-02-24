/**
 * @embedpdf/fonts-sc
 *
 * Simplified Chinese (GB2312) fallback fonts - Noto Sans Hans
 * 5 weights: Light (300) to Bold (700) - subset to stay under CDN limits
 *
 * @packageDocumentation
 */

import type { FontFile, FontPackageMeta } from '@embedpdf/models';

/**
 * Font files included in this package
 */
export const fonts: FontFile[] = [
  { file: 'NotoSansHans-Light.otf', weight: 300 },
  { file: 'NotoSansHans-DemiLight.otf', weight: 350 },
  { file: 'NotoSansHans-Regular.otf', weight: 400 },
  { file: 'NotoSansHans-Medium.otf', weight: 500 },
  { file: 'NotoSansHans-Bold.otf', weight: 700 },
];

/**
 * Package metadata
 */
export const fontsMeta: FontPackageMeta = {
  name: '@embedpdf/fonts-sc',
  fonts,
};
