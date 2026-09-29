import {
  richTextParagraphsFromPlainText,
  richTextPlainText,
  type RichTextBody,
} from '../../dto/RichText';
import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { pdfCalloutEnd } from '../calloutEnd';
import { faceForFreeTextFont, type DescribeFont } from '../fontFaces';
import type { AnnotationDraft, AnnotationDTO, AnnotationPatch } from '../kinds';

type FreeTextPatch = Extract<AnnotationPatch<PdfCoordinates>, { subtype?: 'free-text' }>;

/**
 * What a patch's text style does to the rich body: the font, size, text color
 * and alignment are the body's (runs are deltas over it, so every run that
 * didn't set one follows). `null` when the patch changes none of them.
 */
function bodyChangesOf(
  patch: FreeTextPatch,
  describe?: DescribeFont,
): Partial<RichTextBody> | null {
  const body: Partial<RichTextBody> = {};
  if (patch.fontFamily !== undefined) {
    const face = faceForFreeTextFont(patch.fontFamily, describe);
    body.family = face.family;
    if (face.weight !== undefined) body.weight = face.weight;
    if (face.italic !== undefined) body.italic = face.italic;
  }
  if (patch.fontSize !== undefined) body.size = patch.fontSize;
  if (patch.fontColor != null) body.color = patch.fontColor;
  if (patch.textAlign !== undefined) body.align = patch.textAlign;
  return Object.keys(body).length > 0 ? body : null;
}

/**
 * A free text's text lives in its rich text: `contents` is its plain
 * projection, and the font, size, text color and alignment are its body.
 *
 * - New `richText` brings its `contents`.
 * - New `contents` becomes body-style paragraphs, one per line break (run
 *   formatting goes: a plain-text writer can't keep what it can't see).
 * - A new font, size, text color or alignment moves the body.
 */
export function freeTextFollows(
  current: AnnotationDTO<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
  describe?: DescribeFont,
): AnnotationPatch<PdfCoordinates> {
  if (current.subtype !== 'free-text' || patch.subtype !== 'free-text') return patch;
  const text = patch as FreeTextPatch;
  if (text.richText !== undefined) {
    return text.contents === undefined
      ? { ...text, contents: richTextPlainText(text.richText) }
      : text;
  }
  const style = bodyChangesOf(text, describe);
  if (text.contents !== undefined) {
    const paragraphs = richTextParagraphsFromPlainText(text.contents ?? '');
    return {
      ...text,
      contents: richTextPlainText({ paragraphs }),
      richText: style
        ? { body: { ...current.richText.body, ...style }, paragraphs }
        : { paragraphs },
    };
  }
  if (!style) return text;
  return {
    ...text,
    richText: {
      body: { ...current.richText.body, ...style },
      paragraphs: current.richText.paragraphs,
    },
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
 * A free text draft's text, stated both ways: its rich text, else body-style
 * paragraphs from its `contents` (one per line break, an empty box without
 * any), and `contents` as the rich text's plain projection. A rich text
 * without a body takes the body the draft's font, size and colors make.
 */
export function freeTextDraftFollows(
  draft: AnnotationDraft<PdfCoordinates>,
): AnnotationDraft<PdfCoordinates> {
  if (draft.subtype !== 'free-text') return draft;
  const richText = draft.richText ?? {
    paragraphs: richTextParagraphsFromPlainText(draft.contents ?? ''),
  };
  // The engine writes `/Contents` from the rich text: a line break reads back as `\r`.
  return { ...draft, richText, contents: richTextPlainText(richText) };
}
