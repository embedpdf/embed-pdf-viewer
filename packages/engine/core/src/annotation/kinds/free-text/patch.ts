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
  rectDifferences?: PdfRectDifferences;

  calloutLine?: CalloutLine;
  lineEnding?: LineEnding;

  rotation?: number;
  unrotatedRect?: PdfRect;
}
