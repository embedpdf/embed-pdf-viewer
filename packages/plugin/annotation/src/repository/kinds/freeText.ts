/**
 * Free text (plain box + callout). Owns the callout leader group — the one
 * geometry where `/RD` means "text box inset" rather than a border effect —
 * and the `/DA` text-slice ingest. Font/size/colour lowerings are the GENERIC
 * 1:1 keys (safe as singles since the engine's `/DA` read-modify-write).
 */
import type {
  AnnotationDTO,
  CalloutLine,
  LineEnding,
  PdfRect,
  PdfRectDifferences,
} from '@embedpdf/engine-core/runtime';
import {
  calloutLinePoints,
  geomPdfBounds,
  geomRotation,
  rotatedAabb,
  type Annot,
  type TextStyle,
} from '@embedpdf/core-annotation';

import { boxEmit, type KindProjection } from '../projection';
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
  return {
    fontFamily: dto.fontFamily,
    fontSize: dto.fontSize,
    fontColor: colorToCss(dto.fontColor ?? dto.color),
    textAlign: dto.textAlign,
  };
}

/**
 * The engine geometry for a callout: the overall `/Rect` (text box ∪ leader ∪
 * arrow), the `/RD` inset that recovers the text box from it, the `/CL` leader
 * (`[tip, knee, conn]` with the connection point derived), and the `/LE`
 * ending. All in PDF user space (y-up), with every `/RD` inset clamped
 * non-negative.
 *
 * A tilted box (the upright policy) additionally emits `rotation` +
 * `unrotatedRect` (the logical text box) — the engine bakes the box + text
 * under an INLINE rotation about the box centre while the leader stays
 * page-space, so (unlike plain boxes) the /AP form `/Matrix` stays identity
 * and the raster stays placed by `/Rect`. `/RD` then insets to the ROTATED
 * box's AABB — the best axis-aligned text box a foreign viewer regenerating
 * the AP can draw (spec-conformant degradation). The transform pair is TOTAL
 * (nulls state the clears) like every box emission.
 */
export function calloutFields(
  a: Annot,
  crop: PdfRect,
): {
  rect: PdfRect;
  rectDifferences: PdfRectDifferences;
  calloutLine: CalloutLine;
  lineEnding: LineEnding;
  rotation: number | null;
  unrotatedRect: PdfRect | null;
} | null {
  const g = a.geom;
  if (g.t !== 'text' || !g.callout) return null;
  const rot = geomRotation(g);
  const overall = geomPdfBounds(g, a.style.strokeWidth, crop);
  const tb = contentToPdfRect(rot ? rotatedAabb(g.rect, rot) : g.rect, crop);
  const nn = (n: number) => Math.max(0, n);
  const pts = calloutLinePoints(g).map((p) => contentToPdfPoint(p, crop));
  const calloutLine = (
    pts.length === 3 ? [pts[0], pts[1], pts[2]] : [pts[0], pts[1]]
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
    lineEnding: g.callout.ending,
    ...(rot
      ? { rotation: toPdfRotation(rot), unrotatedRect: contentToPdfRect(g.rect, crop) }
      : { rotation: null, unrotatedRect: null }),
  };
}

export const freeText: KindProjection = {
  ingest: (dto, crop) => {
    const d = dto as FreeTextDTO;
    // A callout (`/IT free-text-callout` + a `/CL` leader): the stored `rect`
    // is the TEXT BOX (the overall `/Rect` inset by `/RD`); the leader's tip
    // is `cl[0]` and the elbow `cl[1]` (a 3-point `/CL`). The connection point
    // — `cl` last — is NOT stored; it's re-derived from the box. A tilted box
    // (the upright policy) reads back from `unrotatedRect` + `rotation`
    // instead — `/RD` only recovers its axis-aligned AABB; foreign PDFs
    // (no EMBD metadata) keep the `/RD` path bit-identically.
    if (d.intent === 'free-text-callout' && d.calloutLine && d.calloutLine.length >= 2) {
      const cl = d.calloutLine;
      const rot = d.rotation ? fromPdfRotation(d.rotation) : 0;
      const box =
        rot && d.unrotatedRect
          ? pdfToContentRect(d.unrotatedRect, crop)
          : pdfToContentRect(insetPdfRectByRD(d.rect, d.rectDifferences), crop);
      return {
        geom: {
          t: 'text',
          rect: box,
          callout: {
            tip: pdfToContentPoint(cl[0], crop),
            knee: cl.length === 3 ? pdfToContentPoint(cl[1], crop) : undefined,
            ending: d.lineEnding ?? 'none',
          },
          ...(rot && d.unrotatedRect ? { rot } : {}),
        },
        text: textFromDTO(d),
      };
    }
    // Plain text box: a box kind — read back the unrotated box + advisory tilt.
    const rot = d.rotation ? fromPdfRotation(d.rotation) : 0;
    const box = rot && d.unrotatedRect ? d.unrotatedRect : d.rect;
    return {
      geom: { t: 'text', rect: pdfToContentRect(box, crop), ...(rot ? { rot } : {}) },
      text: textFromDTO(d),
    };
  },
  geometry: (a, crop) => {
    if (a.geom.t !== 'text') return null;
    const cf = calloutFields(a, crop);
    if (cf) return { ...cf };
    return boxEmit(a, crop);
  },
  // `/IT` + the initial `/Contents` are create-only statements; while typing,
  // the debounced text-edit write owns `contents`.
  draftExtras: (a, crop) => ({
    intent: calloutFields(a, crop) ? 'free-text-callout' : 'free-text',
    contents: a.data?.contents ?? '',
  }),
};
