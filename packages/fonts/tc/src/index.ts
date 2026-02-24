/**
 * @embedpdf/fonts-tc
 *
 * Traditional Chinese (Big5) fallback fonts - Noto Sans Hant
 * 7 weights: Thin (100) to Black (900)
 *
 * @packageDocumentation
 */

import type { FontFile, FontPackageMeta } from '@embedpdf/models';

/**
 * Font files included in this package
 */
export const fonts: FontFile[] = [
  { file: 'NotoSansHant-Thin.otf', weight: 100 },
  { file: 'NotoSansHant-Light.otf', weight: 300 },
  { file: 'NotoSansHant-DemiLight.otf', weight: 350 },
  { file: 'NotoSansHant-Regular.otf', weight: 400 },
  { file: 'NotoSansHant-Medium.otf', weight: 500 },
  { file: 'NotoSansHant-Bold.otf', weight: 700 },
  { file: 'NotoSansHant-Black.otf', weight: 900 },
];

/**
 * Package metadata
 */
export const fontsMeta: FontPackageMeta = {
  name: '@embedpdf/fonts-tc',
  fonts,
};
