/**
 * The quad-bound kinds: text markup (highlight/underline/squiggly/strikeout),
 * caret, and redact. Their `/QuadPoints` are text-anchored — set at create and
 * never patched — so markup and text-redact have NO editable geometry (the
 * full projection is their geometry fallback), while an AREA redact and a
 * caret are box-like and move by `/Rect`.
 */
import type { AnnotationDTO, PdfRect } from '@embedpdf/engine-core/runtime';
import { type Annot, type Quad } from '@embedpdf/core-annotation';

import type { KindProjection } from '../projection';
import {
  colorToCss,
  contentToPdfPoint,
  contentToPdfRect,
  pdfToContentPoint,
  pdfToContentRect,
} from '../seam';

type PdfPt = { x: number; y: number };
type QuadDTO = { p1: PdfPt; p2: PdfPt; p3: PdfPt; p4: PdfPt };

const quadsFromDTO = (quadPoints: QuadDTO[], crop: PdfRect) =>
  quadPoints.map(
    (q) =>
      [
        pdfToContentPoint(q.p1, crop),
        pdfToContentPoint(q.p2, crop),
        pdfToContentPoint(q.p3, crop),
        pdfToContentPoint(q.p4, crop),
      ] as Quad,
  );

/** Content quads → engine `/QuadPoints` (PDF user space); null off quads geom. */
export function quadPointsFor(a: Annot, crop: PdfRect): QuadDTO[] | null {
  if (a.geom.t !== 'quads') return null;
  return a.geom.quads.map((q) => ({
    p1: contentToPdfPoint(q[0], crop),
    p2: contentToPdfPoint(q[1], crop),
    p3: contentToPdfPoint(q[2], crop),
    p4: contentToPdfPoint(q[3], crop),
  }));
}

/** PDF-space bounding box of a set of `/QuadPoints` quads — the `/Rect` a
 *  quad-bearing draft must carry alongside its quads. */
export const pdfBoundsOfQuads = (quads: QuadDTO[]): PdfRect => {
  let left = Infinity;
  let bottom = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  for (const q of quads) {
    for (const p of [q.p1, q.p2, q.p3, q.p4]) {
      if (p.x < left) left = p.x;
      if (p.x > right) right = p.x;
      if (p.y < bottom) bottom = p.y;
      if (p.y > top) top = p.y;
    }
  }
  return { left, bottom, right, top };
};

const markupProjection = (subtype: 'highlight' | 'underline' | 'squiggly' | 'strikeout') => {
  const p: KindProjection = {
    ingest: (dto, crop) => {
      const d = dto as Extract<AnnotationDTO, { subtype: typeof subtype }>;
      return {
        geom: { t: 'quads', quads: quadsFromDTO(d.quadPoints, crop) },
        ...(subtype === 'strikeout' && 'intent' in d && d.intent ? { intent: d.intent } : {}),
      };
    },
    // /QuadPoints geometry isn't edited after create.
    geometry: () => null,
    draftExtras: (a, crop) => {
      const quads = quadPointsFor(a, crop);
      if (!quads) return null;
      return {
        quadPoints: quads,
        ...(subtype === 'strikeout' && a.intent === 'strikeout-text-edit'
          ? { intent: a.intent }
          : {}),
      };
    },
  };
  return p;
};

export const highlight = markupProjection('highlight');
export const underline = markupProjection('underline');
export const squiggly = markupProjection('squiggly');
export const strikeout = markupProjection('strikeout');

export const caret: KindProjection = {
  ingest: (dto, crop) => {
    const d = dto as Extract<AnnotationDTO, { subtype: 'caret' }>;
    return {
      geom: { t: 'caret', rect: pdfToContentRect(d.rect, crop) },
      ...(d.intent ? { intent: d.intent } : {}),
    };
  },
  geometry: (a, crop) =>
    a.geom.t === 'caret' ? { rect: contentToPdfRect(a.geom.rect, crop) } : null,
  // The fixed drawn-symbol inset + the replace-text intent + seeded contents
  // are create-only statements.
  draftExtras: (a) => ({
    rectDifferences: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
    ...(a.intent === 'replace' ? { intent: a.intent } : {}),
    ...(a.data?.contents != null ? { contents: a.data.contents } : {}),
  }),
};

export const redact: KindProjection = {
  ingest: (dto, crop) => {
    const d = dto as Extract<AnnotationDTO, { subtype: 'redact' }>;
    // Text redaction carries per-line quads; an AREA redaction is rect-only
    // (`/Rect` IS the removal region per ISO 32000-2), so its geometry is a
    // box and it moves/resizes like a shape.
    const geom: Annot['geom'] =
      d.quadPoints.length > 0
        ? { t: 'quads', quads: quadsFromDTO(d.quadPoints, crop) }
        : { t: 'rect', rect: pdfToContentRect(d.rect, crop), ellipse: false };
    return {
      geom,
      // The label is `/DA`-styled exactly like free text; `fontSize` 0 means
      // auto-fit and round-trips verbatim (the engine's convention).
      text: {
        fontFamily: d.fontFamily,
        fontSize: d.fontSize,
        fontColor: colorToCss(d.fontColor),
        textAlign: d.textAlign,
      },
      ...(d.overlayText ? { label: { text: d.overlayText, repeat: d.repeat } } : {}),
    };
  },
  // Only an AREA mark's box moves/resizes; text-mark quads are create-only.
  geometry: (a, crop) =>
    a.geom.t === 'rect' ? { rect: contentToPdfRect(a.geom.rect, crop) } : null,
  draftExtras: (a, crop) => {
    const quads = quadPointsFor(a, crop);
    // Text redaction: quads + their PDF bounding box as `/Rect` (the engine
    // requires an explicit rect). Area redaction: the geometry group has it.
    return quads ? { quadPoints: quads, rect: pdfBoundsOfQuads(quads) } : {};
  },
};
