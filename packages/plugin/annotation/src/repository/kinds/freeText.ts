/**
 * Free text (plain box + callout). Owns the callout leader group — the text
 * box is the `box`, and the engine works out the `rect` around it, the line
 * and its arrow — and the `/DA` text-slice ingest. Font/size/colour lowerings
 * are the generic 1:1 keys (safe as singles since the engine's `/DA`
 * read-modify-write).
 */
import {
  calloutLinePoints,
  geomRotation,
  type ModelAnnotation,
  type TextStyle,
} from '@embedpdf/core-annotation';
import type {
  AnnotationDTO,
  CalloutLine,
  LineEnding,
  PdfRect,
} from '@embedpdf/engine-core/runtime';

import { richDocOf } from '../../rich-text';
import { boxEmit, type KindProjection, type Wire } from '../projection';
import {
  boxGeomFields,
  colorToCss,
  contentToPdfPoint,
  pdfToContentPoint,
  pdfToContentRect,
} from '../seam';

type FreeTextDTO = Extract<AnnotationDTO, { subtype: 'free-text' }>;

/** Free-text `/DA` fields → content {@link TextStyle}. An absent `fontColor`
 *  falls back to the `/DA` colour — the same rule the CPVT renderer applies. */
function textFromDTO(dto: FreeTextDTO): TextStyle {
  // The rich body carries the formatting the `/DA` cannot: its weight,
  // italic and decoration read back as the toggles (absent = off).
  const body = dto.richText?.body;
  return {
    fontFamily: dto.fontFamily,
    fontSize: dto.fontSize,
    fontColor: colorToCss(dto.fontColor ?? dto.color),
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
const formattingBody = (annotation: ModelAnnotation): Wire => {
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

/**
 * The engine geometry for a callout: the text box (`box`, turned by
 * `rotation` about its middle), the `/CL` leader (`[tip, knee, conn]` with
 * the connection point derived) and the `/LE` ending, in PDF user space
 * (y-up). The engine works out `rect`, the text box with the line and its
 * arrow. A turn tilts the text box only: the engine draws the box and its
 * text under an inline turn while the leader stays page-space. The turn is
 * total (null states the clear) like every box emission.
 */
export function calloutFields(
  annotation: ModelAnnotation,
  crop: PdfRect,
): {
  box: PdfRect;
  rotation: number | null;
  calloutLine: CalloutLine;
  lineEnding: LineEnding;
} | null {
  const geometry = annotation.geometry;
  if (geometry.kind !== 'text' || !geometry.callout) return null;
  const points = calloutLinePoints(geometry).map((point) => contentToPdfPoint(point, crop));
  const calloutLine = (
    points.length === 3 ? [points[0], points[1], points[2]] : [points[0], points[1]]
  ) as CalloutLine;
  return {
    ...boxGeomFields(geometry.rect, geomRotation(geometry), crop),
    calloutLine,
    lineEnding: geometry.callout.ending,
  };
}

export const freeText: KindProjection = {
  ingest: (dto, crop) => {
    const freeTextDto = dto as FreeTextDTO;
    // The text box is the `box`, turned by `rotation`. A callout (`/IT
    // free-text-callout` + a `/CL` leader) adds its leader: the tip is
    // `cl[0]` and the elbow `cl[1]` (a 3-point `/CL`). The connection point —
    // `cl` last — is not stored; it's re-derived from the box.
    const rot = freeTextDto.rotation ?? 0;
    const box = pdfToContentRect(freeTextDto.box, crop);
    const cl = freeTextDto.calloutLine;
    if (freeTextDto.intent === 'free-text-callout' && cl && cl.length >= 2) {
      return {
        geometry: {
          kind: 'text',
          rect: box,
          callout: {
            tip: pdfToContentPoint(cl[0], crop),
            knee: cl.length === 3 ? pdfToContentPoint(cl[1], crop) : undefined,
            ending: freeTextDto.lineEnding ?? 'none',
          },
          ...(rot ? { rot } : {}),
        },
        text: textFromDTO(freeTextDto),
      };
    }
    return {
      geometry: { kind: 'text', rect: box, ...(rot ? { rot } : {}) },
      text: textFromDTO(freeTextDto),
    };
  },
  geometry: (annotation, crop) => {
    if (annotation.geometry.kind !== 'text') return null;
    const cf = calloutFields(annotation, crop);
    if (cf) return { ...cf };
    return boxEmit(annotation, crop);
  },
  prop: { bold: formattingBody, italic: formattingBody, underline: formattingBody },
  // `/IT` + the initial `/Contents` are create-only statements; while typing,
  // the debounced text-edit write owns `contents`.
  draftExtras: (annotation, crop) => ({
    intent: calloutFields(annotation, crop) ? 'free-text-callout' : 'free-text',
    contents: annotation.data?.contents ?? '',
  }),
};
