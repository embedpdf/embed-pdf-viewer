import type { PdfQuad, PdfRect } from '../../../geometry/primitives';
import type { AnnotationDraftBase } from '../../draft-base';
import type { Color, FreeTextFont, TextAlignment } from '../../primitives';

export interface RedactDraft extends AnnotationDraftBase {
  subtype: 'redact';

  /**
   * `/Rect` bounding box — required (for a text redaction, the caller
   * computes it as the quads' bounds).
   */
  rect: PdfRect;
  /** `/QuadPoints`. Omit (or send empty) for an area redaction. */
  quadPoints?: PdfQuad[];

  // colours — optional (engine fills defaults).
  /** `/C` marking-stage outline colour. */
  color?: Color;
  /** `/CA` marking-stage opacity. The applied overlay always paints opaque. */
  opacity?: number;
  /** `/IC` fill painted after apply. `null`/omitted = region left transparent. */
  interiorColor?: Color | null;

  // label — all optional; a redaction without `overlayText` has no label.
  /**
   * `/OverlayText`. When set, the writer also emits a `/DA` (ISO requires
   * one alongside `/OverlayText`), defaulting any omitted triple member.
   */
  overlayText?: string;
  /** `/Repeat` — tile the label to fill the region. */
  repeat?: boolean;
  /**
   * `/DA` font: a PDF standard font name, or the `key` of a font registered
   * through `engine.fonts` (embeds a per-annotation glyph subset on save —
   * local engine only). See `FreeTextDraft`.
   */
  fontFamily?: FreeTextFont;
  /** `/DA` font size, in points. `0` = auto-fit the label to the region. */
  fontSize?: number;
  /** `/DA` colour: the label text colour. */
  fontColor?: Color;
  /** `/Q` label alignment. */
  textAlign?: TextAlignment;
}
