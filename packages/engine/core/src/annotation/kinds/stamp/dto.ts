import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationBase } from '../../base';

/**
 * Stamp annotation (`/Subtype /Stamp`, ISO 32000 §12.5.6.12).
 *
 * The DTO carries no binary fields: the stamp's visual content lives in its
 * `/AP` appearance stream inside the document, and is displayed via
 * `renderAppearanceImages()` like every other baked appearance.
 */
export type StampAnnotationDTO = AnnotationBase & {
  subtype: 'stamp';
  /** `/Name` — advisory stamp label ('Approved', 'Draft', …). */
  name: string | null;
  /** Rotation (deg) from `/EMBD_Metadata`. */
  rotation?: number;
  /** Pre-rotation `/Rect` from `/EMBD_Metadata` (present with `rotation`). */
  unrotatedRect?: PdfRect;
};
