/**
 * How each kind with text sets it: the text view a kind names (`text` in its
 * file), which reads its font, size, colour and alignment off the annotation
 * by the engine's field names and fills in what the kind doesn't keep.
 */
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import type { TextStyle } from '../types';

/**
 * A free text's text is its rich body: the font, size, colour and alignment
 * the engine keeps beside it, and the body's weight, italic and decoration
 * as bold, italic and underline (absent = off). The editor has no justify: a
 * justified box shows left-aligned, and keeps its justify until another
 * alignment is picked.
 */
export function bodyText(annotation: AnnotationDTO): TextStyle {
  const freeText = annotation as Extract<AnnotationDTO, { subtype: 'free-text' }>;
  const body = freeText.richText?.body;
  return {
    fontFamily: freeText.fontFamily,
    fontSize: freeText.fontSize,
    fontColor: freeText.fontColor,
    textAlign: freeText.textAlign === 'justify' ? 'left' : freeText.textAlign,
    ...(body && body.weight >= 600 ? { bold: true } : {}),
    ...(body?.italic ? { italic: true } : {}),
    ...(body?.decoration.includes('underline') ? { underline: true } : {}),
  };
}

/**
 * A form field's text (`/DA`): its font (Helvetica when it names none), its
 * size (0 fits the box), its colour (black when it has none) and alignment.
 */
export function fieldText(annotation: AnnotationDTO): TextStyle {
  const widget = annotation as Extract<AnnotationDTO, { subtype: 'widget' }>;
  return {
    fontFamily: widget.fontFamily ?? 'helvetica',
    fontSize: widget.fontSize ?? 0,
    fontColor: widget.fontColor ? widget.fontColor : '#000000',
    textAlign: widget.textAlign,
  };
}

/** A redaction's label (`/DA`), set like free text; a size of 0 fits the region (the engine's convention). */
export function labelText(annotation: AnnotationDTO): TextStyle {
  const redact = annotation as Extract<AnnotationDTO, { subtype: 'redact' }>;
  return {
    fontFamily: redact.fontFamily,
    fontSize: redact.fontSize,
    fontColor: redact.fontColor,
    textAlign: redact.textAlign,
  };
}
