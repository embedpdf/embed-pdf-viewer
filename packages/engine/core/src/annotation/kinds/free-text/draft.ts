import type { CalloutLine, PdfRect } from '../../../geometry/primitives';
import type { AnnotationDraftBase } from '../../draft-base';
import type {
  AnnotationBorderStyle,
  Color,
  FreeTextFont,
  FreeTextIntent,
  LineEnding,
  PdfRectDifferences,
  TextAlignment,
} from '../../primitives';

export interface FreeTextDraft extends AnnotationDraftBase {
  subtype: 'free-text';
  /** `/IT` intent — required (selects plain text box vs callout). */
  intent: FreeTextIntent;

  // text (`/DA`) — required: a free text has no meaningful default font.
  /**
   * A PDF standard font name, or the `key` of a font registered through
   * `engine.fonts`. A registered key makes the `/DA` reference that runtime
   * font and embeds a per-annotation glyph subset on save (local engine only).
   */
  fontFamily: FreeTextFont;
  fontSize: number;
  textAlign: TextAlignment;

  /** `/Rect` bounding box — required (computed by the caller/plugin). */
  rect: PdfRect;

  // colours — optional (engine fills defaults).
  /** `/DA` colour (border + default text). */
  color?: Color;
  /** Text colour override (`TextColor`). Omit to let text follow `color`. */
  fontColor?: Color;
  /** `/C` box background. `null`/omitted = transparent. */
  interiorColor?: Color | null;
  opacity?: number;

  // border box (`/BS`) — optional.
  strokeWidth?: number;
  borderStyle?: AnnotationBorderStyle;
  dashArray?: number[];
  rectDifferences?: PdfRectDifferences;

  // callout — optional (used when `intent === 'free-text-callout'`).
  calloutLine?: CalloutLine;
  lineEnding?: LineEnding;

  // rotation (box kind).
  rotation?: number;
  unrotatedRect?: PdfRect;
}
