import type { LineEnding } from '@embedpdf/engine-core/runtime';

/**
 * `FPDF_ANNOT_LINE_END` enum codes from `public/fpdf_annot.h`, mapped to the
 * wire-stable kebab-case `LineEnding` strings. We keep this PDFium-specific
 * mapping in engine-services so engine-core stays free of any PDFium
 * dependency (mirrors `shapeBorderStyle.ts`).
 *
 *   None=0, Square=1, Circle=2, Diamond=3, OpenArrow=4, ClosedArrow=5,
 *   Butt=6, ROpenArrow=7, RClosedArrow=8, Slash=9, Unknown=10
 *
 * `Unknown` has no wire representation, so it round-trips as `'none'`.
 */
const LE_NONE = 0;
const LE_SQUARE = 1;
const LE_CIRCLE = 2;
const LE_DIAMOND = 3;
const LE_OPEN_ARROW = 4;
const LE_CLOSED_ARROW = 5;
const LE_BUTT = 6;
const LE_R_OPEN_ARROW = 7;
const LE_R_CLOSED_ARROW = 8;
const LE_SLASH = 9;

export function lineEndingToCode(ending: LineEnding): number {
  switch (ending) {
    case 'square':
      return LE_SQUARE;
    case 'circle':
      return LE_CIRCLE;
    case 'diamond':
      return LE_DIAMOND;
    case 'open-arrow':
      return LE_OPEN_ARROW;
    case 'closed-arrow':
      return LE_CLOSED_ARROW;
    case 'butt':
      return LE_BUTT;
    case 'r-open-arrow':
      return LE_R_OPEN_ARROW;
    case 'r-closed-arrow':
      return LE_R_CLOSED_ARROW;
    case 'slash':
      return LE_SLASH;
    case 'none':
    default:
      return LE_NONE;
  }
}

export function lineEndingFromCode(code: number): LineEnding {
  switch (code) {
    case LE_SQUARE:
      return 'square';
    case LE_CIRCLE:
      return 'circle';
    case LE_DIAMOND:
      return 'diamond';
    case LE_OPEN_ARROW:
      return 'open-arrow';
    case LE_CLOSED_ARROW:
      return 'closed-arrow';
    case LE_BUTT:
      return 'butt';
    case LE_R_OPEN_ARROW:
      return 'r-open-arrow';
    case LE_R_CLOSED_ARROW:
      return 'r-closed-arrow';
    case LE_SLASH:
      return 'slash';
    case LE_NONE:
    default:
      return 'none';
  }
}
