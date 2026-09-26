/**
 * Free text (plain box + callout). Owns the callout leader group — the one
 * geometry where `/RD` means "text box inset" rather than a border effect —
 * and the `/DA` text-slice ingest. Font/size/colour lowerings are the generic
 * 1:1 keys (safe as singles since the engine's `/DA` read-modify-write).
 */
import {
  calloutLinePoints,
  geomPdfBounds,
  geomRotation,
  rotatedAabb,
  type ModelAnnotation,
  type TextStyle,
} from '@embedpdf/core-annotation';
import type {
  AnnotationDTO,
  CalloutLine,
  LineEnding,
  PdfRect,
  PdfRectDifferences,
} from '@embedpdf/engine-core/runtime';

import { richDocOf } from '../../rich-text';
import { boxEmit, type KindProjection, type Wire } from '../projection';
import {
  colorToCss,
  contentToPdfPoint,
  contentToPdfRect,
  fromPdfRotation,
  insetPdfRectByRD,
  pdfToContentPoint,
  pdfToContentRect,
  toPdfRotation,
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
 * The engine geometry for a callout: the overall `/Rect` (text box ∪ leader ∪
 * arrow), the `/RD` inset that recovers the text box from it, the `/CL` leader
 * (`[tip, knee, conn]` with the connection point derived), and the `/LE`
 * ending. All in PDF user space (y-up), with every `/RD` inset clamped
 * non-negative.
 *
 * A tilted box (the upright policy) additionally emits `rotation` +
 * `unrotatedRect` (the logical text box) — the engine bakes the box + text
 * under an inline rotation about the box centre while the leader stays
 * page-space, so (unlike plain boxes) the /AP form `/Matrix` stays identity
 * and the raster stays placed by `/Rect`. `/RD` then insets to the rotated
 * box's AABB — the best axis-aligned text box a foreign viewer regenerating
 * the AP can draw (spec-conformant degradation). The transform pair is total
 * (nulls state the clears) like every box emission.
 */
export function calloutFields(
  annotation: ModelAnnotation,
  crop: PdfRect,
): {
  rect: PdfRect;
  rectDifferences: PdfRectDifferences;
  calloutLine: CalloutLine;
  lineEnding: LineEnding;
  rotation: number | null;
  unrotatedRect: PdfRect | null;
} | null {
  const geometry = annotation.geometry;
  if (geometry.kind !== 'text' || !geometry.callout) return null;
  const rot = geomRotation(geometry);
  const overall = geomPdfBounds(geometry, annotation.style.strokeWidth, crop);
  const tb = contentToPdfRect(rot ? rotatedAabb(geometry.rect, rot) : geometry.rect, crop);
  const nn = (difference: number) => Math.max(0, difference);
  const points = calloutLinePoints(geometry).map((point) => contentToPdfPoint(point, crop));
  const calloutLine = (
    points.length === 3 ? [points[0], points[1], points[2]] : [points[0], points[1]]
  ) as CalloutLine;
  return {
    rect: overall,
    rectDifferences: {
      left: nn(tb.left - overall.left),
      bottom: nn(tb.bottom - overall.bottom),
      right: nn(overall.right - tb.right),
      top: nn(overall.top - tb.top),
    },
    calloutLine,
    lineEnding: geometry.callout.ending,
    ...(rot
      ? { rotation: toPdfRotation(rot), unrotatedRect: contentToPdfRect(geometry.rect, crop) }
      : { rotation: null, unrotatedRect: null }),
  };
}

export const freeText: KindProjection = {
  ingest: (dto, crop) => {
    const freeTextDto = dto as FreeTextDTO;
    // A callout (`/IT free-text-callout` + a `/CL` leader): the stored `rect`
    // is the text box (the overall `/Rect` inset by `/RD`); the leader's tip
    // is `cl[0]` and the elbow `cl[1]` (a 3-point `/CL`). The connection point
    // — `cl` last — is not stored; it's re-derived from the box. A tilted box
    // (the upright policy) reads back from `unrotatedRect` + `rotation`
    // instead — `/RD` only recovers its axis-aligned AABB; foreign PDFs
    // (no EMBD metadata) keep the `/RD` path bit-identically.
    if (
      freeTextDto.intent === 'free-text-callout' &&
      freeTextDto.calloutLine &&
      freeTextDto.calloutLine.length >= 2
    ) {
      const cl = freeTextDto.calloutLine;
      const rot = freeTextDto.rotation ? fromPdfRotation(freeTextDto.rotation) : 0;
      const box =
        rot && freeTextDto.unrotatedRect
          ? pdfToContentRect(freeTextDto.unrotatedRect, crop)
          : pdfToContentRect(insetPdfRectByRD(freeTextDto.rect, freeTextDto.rectDifferences), crop);
      return {
        geometry: {
          kind: 'text',
          rect: box,
          callout: {
            tip: pdfToContentPoint(cl[0], crop),
            knee: cl.length === 3 ? pdfToContentPoint(cl[1], crop) : undefined,
            ending: freeTextDto.lineEnding ?? 'none',
          },
          ...(rot && freeTextDto.unrotatedRect ? { rot } : {}),
        },
        text: textFromDTO(freeTextDto),
      };
    }
    // Plain text box: a box kind — read back the unrotated box + advisory tilt.
    const rot = freeTextDto.rotation ? fromPdfRotation(freeTextDto.rotation) : 0;
    const box = rot && freeTextDto.unrotatedRect ? freeTextDto.unrotatedRect : freeTextDto.rect;
    return {
      geometry: { kind: 'text', rect: pdfToContentRect(box, crop), ...(rot ? { rot } : {}) },
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
