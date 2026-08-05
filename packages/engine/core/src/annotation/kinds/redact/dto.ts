import type { PdfQuad } from '../../../geometry/primitives';
import type { AnnotationBase } from '../../base';
import type { Color, StandardFont, TextAlignment } from '../../primitives';
import type { ColorStyleFields } from '../style.shared';

/**
 * Redaction annotation (`/Redact`, ISO 32000-2 12.5.6.23). The annotation is
 * the non-destructive MARKING stage: it declares what should be removed and
 * what the region must look like afterwards. The destructive APPLY is a
 * separate document operation, not an annotation mutation.
 *
 * Color model: `color` is `/C` — the marking-stage outline (the universal
 * `/C` field every family shares). `interiorColor` is `/IC` — the fill
 * painted where content was removed once the redaction is applied (`null` =
 * region left transparent, the ISO default).
 *
 * Label model: `overlayText` (`/OverlayText`) is drawn over the applied
 * region, styled by the `/DA` triple (`fontFamily`/`fontSize`/`fontColor`)
 * and `/Q` (`textAlign`); `repeat` (`/Repeat`) tiles it to fill the region.
 * A pre-baked `/RO` overlay stream, when present in a file, takes precedence
 * over all of these at apply time — it is an appearance artifact and is not
 * surfaced on the DTO.
 */
export type RedactAnnotationDTO = AnnotationBase &
  ColorStyleFields & {
    subtype: 'redact';
    /**
     * `/QuadPoints` — the regions of a text redaction. Empty for an area
     * redaction, where `/Rect` itself is the removal region (ISO 32000-2).
     */
    quadPoints: PdfQuad[];
    /** `/IC` fill painted after apply. `null` when the region stays transparent. */
    interiorColor: Color | null;
    /** `/OverlayText` label. `null` when the redaction has no label. */
    overlayText: string | null;
    /** `/Repeat` — tile the label to fill the region. */
    repeat: boolean;
    /** `/DA` font. */
    fontFamily: StandardFont;
    /** `/DA` font size, in points. `0` = auto-fit the label to the region. */
    fontSize: number;
    /** `/DA` colour: the label text colour. */
    fontColor: Color;
    /** `/Q` label alignment. */
    textAlign: TextAlignment;
  };
