import type { PdfQuad, PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';
import type { Color, FreeTextFont, TextAlignment } from '../../primitives';

export interface RedactPatch extends AnnotationPatchBase {
  subtype: 'redact';

  rect?: PdfRect;
  quadPoints?: PdfQuad[];

  color?: Color;
  opacity?: number;
  interiorColor?: Color | null;

  /** `/OverlayText`. `null` clears the label. */
  overlayText?: string | null;
  repeat?: boolean;

  /**
   * `/DA` triple. Because `/DA` packs font, size, and colour into one string,
   * send the full triple (`fontFamily` + `fontSize` + `fontColor`) together
   * when changing any of them — same rule as `FreeTextPatch`.
   */
  fontFamily?: FreeTextFont;
  fontSize?: number;
  fontColor?: Color;
  textAlign?: TextAlignment;
}
