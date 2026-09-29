import type {
  AnnotationBase,
  CalloutLine,
  Color,
  FreeTextAnnotationDTO,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { FPDFANNOT_COLORTYPE } from '../colorType';
import { freeTextIntentFromName } from '../freeTextIntent';
import { freeTextFontForFace, readEngineRichText } from '../richTextWire';
import { standardFontFromCode, DEFAULT_STANDARD_FONT } from '../standardFont';
import { textAlignmentFromCode } from '../textAlignment';
import { VERTICAL_ALIGNMENT_KEY, verticalAlignmentFromCode } from '../verticalAlignment';
import type { AnnotationReadContext } from './annotationReadContext';
import {
  readAnnotColor,
  readAnnotOpacity,
  readBorderEffect,
  readCalloutLine,
  readDefaultAppearance,
  readIntent,
  readLineEndings,
  readTextAlignment,
} from './annotationReadPrimitives';
import { readAnnotationBox } from './readAnnotationTurn';
import { readEmbedMetadataNumber } from './readEmbedMetadata';
import { readBorderFields } from './readStyle';

/** Default `/DA` colour (black) when an annotation has no default appearance. */
const DEFAULT_FREETEXT_COLOR: Color = '#000000';

/** Default font size when `/DA` has none (or an unusable 0). */
const DEFAULT_FONT_SIZE = 12;

export function readFreeText(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
  _subtypeCode?: number,
  ctx?: AnnotationReadContext,
): FreeTextAnnotationDTO<PdfCoordinates> {
  const da = readDefaultAppearance(fn, mem, annotPtr);
  const color = da?.color ?? DEFAULT_FREETEXT_COLOR;
  // The rich text is always there: the annotation's own /RC, else a one-run
  // document the engine synthesises from /Contents + /DA. Its body is the
  // face the /DA names, resolved by identity — so a registered font reads
  // back as its key (the `standardFontFromCode` path only knows the 14).
  const rich = readEngineRichText(fn, mem, annotPtr);
  const fonts = ctx?.fonts;
  const fontFamily = rich
    ? freeTextFontForFace(
        rich.body,
        fonts ? (family, weight, italic) => fonts.keyForFace(family, weight, italic) : undefined,
      )
    : da
      ? standardFontFromCode(da.fontCode)
      : DEFAULT_STANDARD_FONT;
  const fontSize =
    rich && rich.body.size > 0
      ? rich.body.size
      : da && da.fontSize > 0
        ? da.fontSize
        : DEFAULT_FONT_SIZE;
  const richText = rich ?? {
    body: {
      family: 'Helvetica',
      weight: 400,
      italic: false,
      size: fontSize,
      color,
      decoration: [],
      script: 'normal',
      letterSpacing: 0,
      horizontalScale: 1,
      align: 'left',
      dir: 'ltr',
    },
    paragraphs: [{ runs: [{ text: base.contents ?? '' }] }],
  };

  // The text is the rich text body's color, as Acrobat draws it; `/DA`'s
  // is the border's (a plain box's body takes it from `/DA`).
  const fontColor = richText.body.color.toLowerCase() as Color;

  // For free text `/C` (color type 0) is the box background, not a stroke.
  const background = readAnnotColor(fn, mem, annotPtr, FPDFANNOT_COLORTYPE.Color);

  const ca = readAnnotOpacity(fn, mem, annotPtr);
  const opacity = ca == null ? 1 : Math.max(0, Math.min(1, ca));

  // The rich body's alignment is what the appearance paints (it wins over
  // /Q, which has no justify); a plain box's synthesised body carries /Q.
  const textAlign = rich ? rich.body.align : textAlignmentFromCode(readTextAlignment(fn, annotPtr));
  const verticalAlign = verticalAlignmentFromCode(
    readEmbedMetadataNumber(fn, mem, annotPtr, VERTICAL_ALIGNMENT_KEY),
  );
  const intent = freeTextIntentFromName(readIntent(fn, mem, annotPtr));

  const points = readCalloutLine(fn, mem, annotPtr);
  const calloutLine: CalloutLine | undefined =
    points.length === 2
      ? [points[0]!, points[1]!]
      : points.length === 3
        ? [points[0]!, points[1]!, points[2]!]
        : undefined;
  const leaderEnd = readLineEndings(fn, mem, annotPtr).end;

  return {
    ...base,
    subtype: 'free-text',
    intent,
    fontFamily,
    fontSize,
    textAlign,
    verticalAlign,
    richText,
    color,
    fontColor,
    interiorColor: background ?? null,
    opacity,
    ...readBorderFields(fn, mem, annotPtr),
    cloudyIntensity: readBorderEffect(fn, mem, annotPtr),
    ...readAnnotationBox(fn, mem, annotPtr),
    calloutLine: calloutLine ?? null,
    lineEnding: calloutLine !== undefined && leaderEnd !== 'none' ? leaderEnd : null,
  };
}
