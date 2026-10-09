import type { VerticalAlignment } from '@embedpdf/engine-core/runtime';

/**
 * Where a free text's lines sit in its box, as our `/EMBD_Metadata`
 * `/VerticalAlignment` number holds it (PDF has no key for it): 0 top,
 * 1 middle, 2 bottom. The appearance generator reads the same number.
 */
export const VERTICAL_ALIGNMENT_KEY = 'VerticalAlignment';

const CODES: readonly VerticalAlignment[] = ['top', 'middle', 'bottom'];

export function verticalAlignmentToCode(align: VerticalAlignment): number {
  return CODES.indexOf(align);
}

/** An absent or unknown number is top, as the generator draws it. */
export function verticalAlignmentFromCode(code: number | undefined): VerticalAlignment {
  return (code !== undefined && CODES[code]) || 'top';
}
