import type { TextAlignment } from '@embedpdf/engine-core/runtime';

/**
 * `/Q` quadding codes (ISO 32000 §12.7.3.3) mapped to the wire-stable
 * `TextAlignment` strings. Kept in engine-services so engine-core stays
 * PDFium-free (mirrors `lineEnding.ts`).
 *
 *   Left=0, Center=1, Right=2
 */
const Q_LEFT = 0;
const Q_CENTER = 1;
const Q_RIGHT = 2;

export function textAlignmentToCode(align: TextAlignment): number {
  switch (align) {
    case 'center':
      return Q_CENTER;
    case 'right':
      return Q_RIGHT;
    case 'left':
    default:
      return Q_LEFT;
  }
}

export function textAlignmentFromCode(code: number): TextAlignment {
  switch (code) {
    case Q_CENTER:
      return 'center';
    case Q_RIGHT:
      return 'right';
    case Q_LEFT:
    default:
      return 'left';
  }
}
