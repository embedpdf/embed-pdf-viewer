import type { CalloutLine, PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';
import type {
  AnnotationBorderStyle,
  Color,
  FreeTextFont,
  FreeTextIntent,
  LineEnding,
  PdfRectDifferences,
  TextAlignment,
} from '../../primitives';

export interface FreeTextPatch extends AnnotationPatchBase {
  subtype: 'free-text';
  intent?: FreeTextIntent;

  /** A PDF standard font name or a registered font `key`. See `FreeTextDraft`. */
  fontFamily?: FreeTextFont;
  fontSize?: number;
  textAlign?: TextAlignment;

  rect?: PdfRect;

  color?: Color;
  fontColor?: Color;
  interiorColor?: Color | null;
  opacity?: number;

  strokeWidth?: number;
  borderStyle?: AnnotationBorderStyle;
  dashArray?: number[];
  /** Tri-state: omitted preserves, a value sets, `null` removes `/RD`. */
  rectDifferences?: PdfRectDifferences | null;

  calloutLine?: CalloutLine;
  lineEnding?: LineEnding;

  /** Tri-state: omitted preserves, `null`/`0` flattens, a value sets (needs the box). */
  rotation?: number | null;
  /** Tri-state: omitted preserves, `null` removes, a value sets. */
  unrotatedRect?: PdfRect | null;
}
