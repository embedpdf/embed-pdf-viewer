import type {
  AnnotationBase,
  CalloutLine,
  Color,
  FreeTextAnnotationDTO,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { FPDFANNOT_COLORTYPE } from '../colorType';
import { freeTextIntentFromName } from '../freeTextIntent';
import { freeTextFontForFace, readEngineRichText } from '../richTextWire';
import { standardFontFromCode, DEFAULT_STANDARD_FONT } from '../standardFont';
import { textAlignmentFromCode } from '../textAlignment';
import type { AnnotationReadContext } from './annotationReadContext';
import {
  readAnnotColor,
  readAnnotOpacity,
  readCalloutLine,
  readDefaultAppearance,
  readIntent,
  readLineEndings,
  readRectangleDifferences,
  readTextAlignment,
} from './annotationReadPrimitives';
import { readBorderFields } from './readStyle';
import {
  readAnnotationRotation,
  readAnnotationUnrotatedRect,
} from './readAnnotationTransformMetadata';

/** Default `/DA` colour (black) when an annotation has no default appearance. */
const DEFAULT_FREETEXT_COLOR: Color = { r: 0, g: 0, b: 0 };

/** Default font size when `/DA` has none (or an unusable 0). */
const DEFAULT_FONT_SIZE = 12;

function colorsEqual(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

export function readFreeText(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
  _subtypeCode?: number,
  ctx?: AnnotationReadContext,
): FreeTextAnnotationDTO {
  const da = readDefaultAppearance(fn, mem, annotPtr);
  const color = da?.color ?? { ...DEFAULT_FREETEXT_COLOR };
  // The rich text is always there: the annotation's own /RC, else a one-run
  // document the engine synthesises from /Contents + /DA. Its body is the
  // face the /DA names, resolved by identity — so a registered font reads
  // back as its key (the `standardFontFromCode` path only knows the 14).
  const rich = readEngineRichText(fn, mem, annotPtr);
  const fonts = ctx?.fonts;
  const fontFamily = rich
    ? freeTextFontForFace(
        rich.document.body,
        fonts ? (family, weight, italic) => fonts.keyForFace(family, weight, italic) : undefined,
      )
    : da
      ? standardFontFromCode(da.fontCode)
      : DEFAULT_STANDARD_FONT;
  const fontSize =
    rich && rich.document.body.size > 0
      ? rich.document.body.size
      : da && da.fontSize > 0
        ? da.fontSize
        : DEFAULT_FONT_SIZE;
  const richText = rich?.document ?? {
    body: {
      family: 'Helvetica',
      weight: 400,
      italic: false,
      size: fontSize,
      color: '#000000',
      decoration: [],
      script: 'normal',
      letterSpacing: 0,
      horizontalScale: 1,
      align: 'left',
      dir: 'ltr',
    },
    paragraphs: [{ runs: [{ text: base.contents ?? '' }] }],
  };

  // `TextColor` overrides text only; surface it as `fontColor` solely when it
  // is present AND differs from the `/DA` colour (otherwise text follows `color`).
  const textColor = readAnnotColor(fn, mem, annotPtr, FPDFANNOT_COLORTYPE.TextColor);
  const fontColor = textColor && !colorsEqual(textColor, color) ? textColor : undefined;

  // For free text `/C` (color type 0) is the box background, not a stroke.
  const background = readAnnotColor(fn, mem, annotPtr, FPDFANNOT_COLORTYPE.Color);

  const ca = readAnnotOpacity(fn, mem, annotPtr);
  const opacity = ca == null ? 1 : Math.max(0, Math.min(1, ca));

  // The rich body's alignment is what the appearance paints (it wins over
  // /Q); a plain box's synthesised body carries /Q, so both agree. Justify
  // has no /Q value and reads back as the /Q alignment.
  const quadding = textAlignmentFromCode(readTextAlignment(fn, annotPtr));
  const textAlign =
    rich && rich.document.body.align !== 'justify' ? rich.document.body.align : quadding;
  const intent = freeTextIntentFromName(readIntent(fn, mem, annotPtr));

  const points = readCalloutLine(fn, mem, annotPtr);
  const calloutLine: CalloutLine | undefined =
    points.length === 2
      ? [points[0]!, points[1]!]
      : points.length === 3
        ? [points[0]!, points[1]!, points[2]!]
        : undefined;
  const leaderEnd = readLineEndings(fn, mem, annotPtr).end;

  const rd = readRectangleDifferences(fn, mem, annotPtr);
  const rotation = readAnnotationRotation(fn, mem, annotPtr);
  const unrotatedRect = readAnnotationUnrotatedRect(fn, mem, annotPtr);

  return {
    ...base,
    subtype: 'free-text',
    intent,
    fontFamily,
    fontSize,
    textAlign,
    richText,
    richTextSource: rich?.source ?? 'contents',
    color,
    ...(fontColor !== undefined ? { fontColor } : {}),
    interiorColor: background ?? null,
    opacity,
    ...readBorderFields(fn, mem, annotPtr),
    rectDifferences: rd,
    ...(calloutLine !== undefined ? { calloutLine } : {}),
    ...(calloutLine !== undefined && leaderEnd !== 'none' ? { lineEnding: leaderEnd } : {}),
    ...(rotation != null ? { rotation } : {}),
    ...(unrotatedRect ? { unrotatedRect } : {}),
  };
}
