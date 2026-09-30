import { EngineError } from '../../errors/EngineError';
import { EngineErrorCode } from '../../errors/EngineErrorCode';
import {
  richTextParagraphsFromPlainText,
  richTextPlainText,
  type RichTextBody,
} from '../../dto/RichText';
import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { pdfCalloutEnd } from '../calloutEnd';
import { faceForFreeTextFont, type DescribeFont } from '../fontFaces';
import type { AnnotationDraft, AnnotationDTO, AnnotationPatch } from '../kinds';
import type { FreeTextIntent } from '../primitives';

type FreeTextPatch = Extract<AnnotationPatch<PdfCoordinates>, { subtype?: 'free-text' }>;
type FreeTextRead = Extract<AnnotationDTO<PdfCoordinates>, { subtype: 'free-text' }>;

/** A free text's text style: the four fields that are its rich body's. */
type TextStyle = Pick<FreeTextPatch, 'fontFamily' | 'fontSize' | 'fontColor' | 'textAlign'>;

/**
 * `base` with a free text's text style over it. The font, size, text color
 * and alignment are the rich body's (runs are deltas over it, so every run
 * that didn't set one follows), and a style given by itself wins over the
 * body's.
 */
export function bodyWithStyle(
  base: Partial<RichTextBody>,
  style: TextStyle,
  describe?: DescribeFont,
): Partial<RichTextBody> {
  const body = { ...base };
  if (style.fontFamily !== undefined) {
    const face = faceForFreeTextFont(style.fontFamily, describe);
    body.family = face.family;
    if (face.weight !== undefined) body.weight = face.weight;
    if (face.italic !== undefined) body.italic = face.italic;
  }
  if (style.fontSize !== undefined) body.size = style.fontSize;
  if (style.fontColor != null) body.color = style.fontColor;
  if (style.textAlign !== undefined) body.align = style.textAlign;
  return body;
}

/** A callout line goes only with the callout intent: another box would draw without it. */
function assertCalloutIntent(intent: FreeTextIntent, calloutLine: unknown): void {
  if (calloutLine != null && intent !== 'free-text-callout') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `free-text: a callout line needs intent 'free-text-callout', not '${intent}'`,
      { details: { field: 'intent' } },
    );
  }
}

/**
 * The text style fields a new body brings, beside it: a free text reads its
 * size, text color and alignment off its body, so they change with it. Only
 * the ones that differ from `current`, and never over one the patch states.
 */
function styleOfBody(
  body: Partial<RichTextBody>,
  current: FreeTextRead,
  text: FreeTextPatch,
): TextStyle {
  const style: TextStyle = {};
  if (text.fontSize === undefined && body.size !== undefined && body.size !== current.fontSize) {
    style.fontSize = body.size;
  }
  if (
    text.fontColor === undefined &&
    body.color !== undefined &&
    body.color.toLowerCase() !== current.fontColor?.toLowerCase()
  ) {
    style.fontColor = body.color.toLowerCase();
  }
  if (
    text.textAlign === undefined &&
    body.align !== undefined &&
    body.align !== current.textAlign
  ) {
    style.textAlign = body.align;
  }
  return style;
}

/**
 * A free text's text lives in its rich text: `contents` is its plain
 * projection, and the font, size, text color and alignment are its body.
 *
 * - New `richText` brings its `contents`; a partial body merges over the
 *   current one.
 * - New `contents` becomes body-style paragraphs, one per line break (run
 *   formatting goes: a plain-text writer can't keep what it can't see).
 * - A new font, size, text color or alignment moves the body.
 * - Whatever moves the body states the complete rich text to write, and the
 *   size, text color and alignment it reads back with.
 * - A callout line needs the callout intent.
 */
export function freeTextFollows(
  current: AnnotationDTO<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
  describe?: DescribeFont,
): AnnotationPatch<PdfCoordinates> {
  if (current.subtype !== 'free-text' || patch.subtype !== 'free-text') return patch;
  const text = patch as FreeTextPatch;
  if (text.intent !== undefined || text.calloutLine !== undefined) {
    assertCalloutIntent(
      text.intent ?? current.intent,
      text.calloutLine !== undefined ? text.calloutLine : current.calloutLine,
    );
  }
  const changes = bodyWithStyle({}, text, describe);
  const textChanged = text.richText !== undefined || text.contents !== undefined;
  if (!textChanged && Object.keys(changes).length === 0) return text;
  const body = { ...current.richText.body, ...text.richText?.body, ...changes };
  const paragraphs =
    text.richText?.paragraphs ??
    (text.contents !== undefined
      ? richTextParagraphsFromPlainText(text.contents ?? '')
      : current.richText.paragraphs);
  const richText = { body, paragraphs };
  return {
    ...text,
    ...styleOfBody(body, current, text),
    richText,
    // The engine writes `/Contents` from the rich text: a line break reads back as `\r`.
    ...(textChanged ? { contents: richTextPlainText(richText) } : {}),
  };
}

/**
 * A callout's line stays attached: when its box moves or turns and the
 * patch doesn't state its own `calloutLine`, the line's end moves to where
 * the line now meets the box (the side its knee, else its tip, lies beyond).
 * A stated `calloutLine` is kept as given; a patch that moves neither the box
 * nor its turn keeps the stored end.
 */
export function calloutEndFollows(
  current: AnnotationDTO<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  if (current.subtype !== 'free-text' || patch.subtype !== 'free-text') return patch;
  const text = patch as FreeTextPatch;
  const line = current.calloutLine;
  if (!line || text.calloutLine !== undefined) return text;
  if (text.box === undefined && text.rotation === undefined) return text;
  const box = text.box ?? current.box;
  const rotation = (text.rotation === undefined ? current.rotation : text.rotation) ?? 0;
  const knee = line.length === 3 ? line[1] : undefined;
  const end = pdfCalloutEnd(box, knee ?? line[0], rotation);
  return { ...text, calloutLine: knee ? [line[0], knee, end] : [line[0], end] };
}

/**
 * A free text draft, stated whole:
 *
 * - its intent: the callout intent when it has a callout line, else a plain
 *   box (a callout line needs the callout intent);
 * - its text as rich text: the draft's rich text, else body-style paragraphs
 *   from its `contents` (one per line break, an empty box without any), with
 *   the text style over the body (a style given by itself wins over the
 *   body's; what neither gives is the engine's default);
 * - `contents` as the rich text's plain projection.
 */
export function freeTextDraftFollows(
  draft: AnnotationDraft<PdfCoordinates>,
  describe?: DescribeFont,
): AnnotationDraft<PdfCoordinates> {
  if (draft.subtype !== 'free-text') return draft;
  const intent = draft.intent ?? (draft.calloutLine != null ? 'free-text-callout' : 'free-text');
  assertCalloutIntent(intent, draft.calloutLine);
  const richText = {
    body: bodyWithStyle(draft.richText?.body ?? {}, draft, describe),
    paragraphs: draft.richText?.paragraphs ?? richTextParagraphsFromPlainText(draft.contents ?? ''),
  };
  // The engine writes `/Contents` from the rich text: a line break reads back as `\r`.
  return { ...draft, intent, richText, contents: richTextPlainText(richText) };
}
