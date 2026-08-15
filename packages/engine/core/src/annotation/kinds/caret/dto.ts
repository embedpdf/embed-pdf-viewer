import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationBase } from '../../base';
import type { CaretIntent, PdfRectDifferences } from '../../primitives';
import type { ColorStyleFields } from '../style.shared';

/**
 * Caret annotation — a visual marker for a proposed text insertion or edit
 * point. It carries no geometry of its own beyond `/Rect`: just a `/C` color,
 * `/CA` opacity, and an optional `/RD` inset of the drawn symbol from `/Rect`.
 *
 * A caret anchored to ROTATED text carries the box-family rotation pair:
 * `rotation` (`/EMBD_Metadata/Rotation`, PDF-convention degrees) tilts the
 * baked symbol to ride its text's baseline, `unrotatedRect` is the logical
 * box, and `/Rect` stays the rotated visual AABB — exactly the shape/free-text
 * contract, so the generic AP machinery bakes it.
 */
export type CaretAnnotationDTO = AnnotationBase &
  ColorStyleFields & {
    subtype: 'caret';
    /** Normalized `/IT`; null for an ordinary caret without a text-edit intent. */
    intent: CaretIntent | null;
    /** `/RD` inset of the drawn caret from `/Rect`; `null` when absent. */
    rectDifferences: PdfRectDifferences | null;
    /** `/EMBD_Metadata/Rotation` — degrees, normalized `[0,360)`. */
    rotation?: number;
    /** `/EMBD_Metadata/UnrotatedRect` — the logical box (required when rotation != 0). */
    unrotatedRect?: PdfRect;
  };
