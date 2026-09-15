import type { RichTextDocument, RichTextSource } from '../../../dto/RichText';
import type { CalloutLine, PdfRect } from '../../../geometry/primitives';
import type { AnnotationBase } from '../../base';
import type {
  AnnotationBorderStyle,
  Color,
  FreeTextFont,
  FreeTextIntent,
  LineEnding,
  PdfRectDifferences,
  TextAlignment,
} from '../../primitives';

/**
 * FreeText (and Callout) annotation. One kind covers both: a plain text box
 * (`intent: 'free-text'`) and a callout (`intent: 'free-text-callout'`) which
 * adds a `/CL` leader line.
 *
 * Color model (see the kind docs): `color` is the `/DA` colour — it paints the
 * border and, by default, the text. `fontColor` (optional) overrides just the
 * text via the `TextColor` channel. `interiorColor` is the `/C` box background
 * (`null` when transparent).
 */
export type FreeTextAnnotationDTO = AnnotationBase & {
  subtype: 'free-text';
  /** `/IT` intent. */
  intent: FreeTextIntent;

  // text (`/DA`)
  /**
   * The body face: a standard font name, the `key` of a registered font
   * whose family/weight/italic match the body, or — for a face the
   * document embeds but this session did not register — its family name.
   */
  fontFamily: FreeTextFont;
  /** `/DA` font size, in points. */
  fontSize: number;
  /** `/Q` horizontal text alignment. */
  textAlign: TextAlignment;
  /**
   * The rich text, always present: the annotation's `/RC` when it has one,
   * else a one-run document synthesised from `/Contents` and `/DA`.
   * `richTextSource` says which, so a client cannot mistake a synthesised
   * document for authored rich text.
   */
  richText: RichTextDocument;
  richTextSource: RichTextSource;

  // colours
  /** `/DA` colour: the border colour and the default text colour. */
  color: Color;
  /** Text colour override (`TextColor`). Absent when the text follows `color`. */
  fontColor?: Color;
  /** `/C` box background. `null` when the box is transparent. */
  interiorColor: Color | null;
  /** `/CA` constant opacity, 0..1. */
  opacity: number;

  // border box (`/BS`)
  /** `/BS /W` border width, in points. */
  strokeWidth: number;
  /** `/BS /S` border style. */
  borderStyle: AnnotationBorderStyle;
  /** `/BS /D` dash pattern. Only meaningful when `borderStyle === 'dashed'`. */
  dashArray?: number[];
  /** `/RD` inset of the drawn box from `/Rect`; `null` when absent. */
  rectDifferences: PdfRectDifferences | null;

  // callout (only when `intent === 'free-text-callout'`)
  /** `/CL` leader line (2 or 3 points). */
  calloutLine?: CalloutLine;
  /** `/LE` ending drawn at the called-out end of the leader line. */
  lineEnding?: LineEnding;

  // rotation (box kind — same model as square/circle). For a CALLOUT the pair
  // describes the text BOX only: `unrotatedRect` is the logical text box and
  // the rotation is baked as an INLINE matrix in the /AP (the /CL leader stays
  // page-space, so the form /Matrix is identity and /Rect places the raster).
  /** `/EMBD_Metadata/Rotation` — degrees, normalized `[0,360)`. */
  rotation?: number;
  /** `/EMBD_Metadata/UnrotatedRect` — the logical box (required when rotation != 0). */
  unrotatedRect?: PdfRect;
};
