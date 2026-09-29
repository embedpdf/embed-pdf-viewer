/**
 * Free text (plain box + callout). Its box, turn and callout line are read
 * and written by the text box family (`shapes/text-box.ts`); what it adds
 * here is its text: the `/DA` text-slice ingest and the formatting toggles.
 * Font/size/colour lowerings are the generic 1:1 keys (safe as singles since
 * the engine's `/DA` read-modify-write).
 */
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import { richDocOf } from '../../richtext';
import { readTextBox, writeTextBox } from '../../shapes/text-box';
import type { RecordFields, TextStyle } from '../../types';
import type { KindProjection, Wire } from '../projection';

type FreeTextDTO = Extract<AnnotationDTO, { subtype: 'free-text' }>;

/** Free-text `/DA` fields → content {@link TextStyle}. An absent `fontColor`
 *  falls back to the `/DA` colour — the same rule the CPVT renderer applies. */
export function textFromDTO(dto: FreeTextDTO): TextStyle {
  // The rich body carries the formatting the `/DA` cannot: its weight,
  // italic and decoration read back as the toggles (absent = off).
  const body = dto.richText?.body;
  return {
    fontFamily: dto.fontFamily,
    fontSize: dto.fontSize,
    fontColor: dto.fontColor ?? dto.color,
    textAlign: dto.textAlign,
    ...(body && body.weight >= 600 ? { bold: true } : {}),
    ...(body?.italic ? { italic: true } : {}),
    ...(body?.decoration.includes('underline') ? { underline: true } : {}),
  };
}

/**
 * A formatting toggle is a body change (runs are deltas over it), so it
 * lowers as a rich write carrying the current paragraphs — and every toggle
 * lowers the same complete body (the current one with the three toggles
 * applied: a partial body means engine defaults, which would reset the
 * size, face and colour), so a patch of several merges cleanly.
 */
const formattingBody = (annotation: RecordFields): Wire => {
  const doc = richDocOf(annotation);
  const style = annotation.text;
  return {
    richText: {
      body: {
        ...doc.body,
        weight: style?.bold ? 700 : 400,
        italic: !!style?.italic,
        decoration: style?.underline ? ['underline'] : [],
      },
      paragraphs: doc.paragraphs,
    },
  };
};

/** Is the record a callout: a text box with a line? */
const isCallout = (annotation: RecordFields): boolean =>
  annotation.geometry.kind === 'text-box' && annotation.geometry.calloutLine !== null;

export const freeText: KindProjection = {
  ingest: (dto) => {
    const freeTextDto = dto as FreeTextDTO;
    return { geometry: readTextBox(freeTextDto), text: textFromDTO(freeTextDto) };
  },
  geometry: (annotation) =>
    annotation.geometry.kind === 'text-box' ? writeTextBox(annotation.geometry) : null,
  prop: { bold: formattingBody, italic: formattingBody, underline: formattingBody },
  // `/IT` + the initial `/Contents` are create-only statements; while typing,
  // the debounced text-edit write owns `contents`.
  draftExtras: (annotation) => ({
    intent: isCallout(annotation) ? 'free-text-callout' : 'free-text',
    contents: annotation.annotation?.contents ?? '',
  }),
};
