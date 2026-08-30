/**
 * The stroke family — line, polygon, polyline, ink. Shared physics: their
 * `/Rect` is the VISUAL bounds (stroke radius included — and, for a cloudy
 * polygon, the outward curl extent), so it derives from the point geometry
 * PLUS the stroke width, border, and line endings; and their
 * `/EMBD_Metadata/Rotation` is an advisory scalar (the points are already
 * rotated; inert for AP).
 */
import type { AnnotationDTO, PdfRect } from '@embedpdf/engine-core/runtime';
import {
  geomPdfBounds,
  geomRotation,
  pdfToContentPoint,
  type Annot,
} from '@embedpdf/core-annotation';

import type { KindProjection, Wire } from '../projection';
import { borderSlice } from '../props';
import { contentToPdfPoint, rotFromDTO, toPdfRotation } from '../seam';

/** Advisory rotation, TOTAL: rotation 0 states `null` (tri-state clear) —
 *  omission would preserve a stale advisory angle. */
const advisoryRotation = (g: Annot['geom']): { rotation: number | null } => {
  const rot = geomRotation(g);
  return { rotation: rot ? toPdfRotation(rot) : null };
};

/** `/BE` intensity for a closed poly (polygon): the curls are generated from
 *  /Vertices + /BE alone — per ISO 32000 no /RD applies — and the /Rect
 *  (geomPdfBounds WITH the border) already includes the outward cloud extent. */
const polyCloudy = (a: Annot): Wire =>
  a.geom.t === 'poly' && a.geom.closed
    ? { cloudyIntensity: a.style.border.kind === 'cloudy' ? a.style.border.intensity : null }
    : {};

/** The visual-bounds `/Rect` (stroke + border included) of a stroke geom. */
const visualRect = (a: Annot, crop: PdfRect): Wire => {
  const g = a.geom;
  if (g.t === 'line' || g.t === 'ink') return { rect: geomPdfBounds(g, a.style.strokeWidth, crop) };
  if (g.t === 'poly') return { rect: geomPdfBounds(g, a.style.strokeWidth, crop, a.style.border) };
  return {};
};

/**
 * A lowering whose key is an INPUT of the derived /Rect: the visual bounds
 * ride along with every emission, so a sparse patch can never change an input
 * without re-emitting the derivation. (The bug this kills: patch `lineEndings`
 * alone → the engine re-bakes the /AP inside the stale /Rect → the new
 * arrowhead is clipped in every viewer except the live vector one.)
 */
const withRect =
  (lower: (a: Annot, crop: PdfRect) => Wire) =>
  (a: Annot, crop: PdfRect): Wire => ({ ...lower(a, crop), ...visualRect(a, crop) });

/** Stroke-family prop exceptions: width, border, AND line endings feed the
 *  derived /Rect — an ending's arrowhead reaches well past the endpoint, and
 *  ISO 32000 requires /Rect to enclose it. Where a key can't change the
 *  bounds (a line's border restyle), the re-emitted rect is an idempotent
 *  no-op — uniformity beats per-case reasoning here. */
const strokeProps: KindProjection['prop'] = {
  strokeWidth: withRect((a) => ({ strokeWidth: a.style.strokeWidth })),
  border: withRect((a) => ({ ...borderSlice(a.style), ...polyCloudy(a) })),
  lineEndings: withRect((a) =>
    (a.geom.t === 'line' || a.geom.t === 'poly') && a.geom.ends
      ? { lineEndings: a.geom.ends }
      : {},
  ),
};

export const line: KindProjection = {
  ingest: (dto, crop) => {
    const d = dto as Extract<AnnotationDTO, { subtype: 'line' }>;
    return {
      geom: {
        t: 'line',
        a: pdfToContentPoint(d.linePoints.start, crop),
        b: pdfToContentPoint(d.linePoints.end, crop),
        ends: d.lineEndings,
        ...rotFromDTO(d.rotation),
      },
    };
  },
  geometry: (a, crop) => {
    const g = a.geom;
    if (g.t !== 'line') return null;
    return {
      linePoints: { start: contentToPdfPoint(g.a, crop), end: contentToPdfPoint(g.b, crop) },
      ...visualRect(a, crop),
      ...advisoryRotation(g),
    };
  },
  prop: strokeProps,
};

const polyProjection = (closed: boolean): KindProjection => ({
  ingest: (dto, crop) => {
    const d = dto as Extract<AnnotationDTO, { subtype: 'polygon' | 'polyline' }>;
    return {
      geom: {
        t: 'poly',
        points: d.vertices.map((p) => pdfToContentPoint(p, crop)),
        closed,
        ...('lineEndings' in d ? { ends: d.lineEndings } : {}),
        ...rotFromDTO(d.rotation),
      },
    };
  },
  geometry: (a, crop) => {
    const g = a.geom;
    if (g.t !== 'poly') return null;
    return {
      vertices: g.points.map((p) => contentToPdfPoint(p, crop)),
      ...visualRect(a, crop),
      ...advisoryRotation(g),
    };
  },
  prop: strokeProps,
});

export const polygon: KindProjection = polyProjection(true);
export const polyline: KindProjection = polyProjection(false);

export const ink: KindProjection = {
  ingest: (dto, crop) => {
    const d = dto as Extract<AnnotationDTO, { subtype: 'ink' }>;
    return {
      geom: {
        t: 'ink',
        strokes: d.inkList.map((stroke) => stroke.map((p) => pdfToContentPoint(p, crop))),
        ...rotFromDTO(d.rotation),
      },
      ...(d.intent ? { intent: d.intent } : {}),
    };
  },
  geometry: (a, crop) => {
    const g = a.geom;
    if (g.t !== 'ink') return null;
    return {
      inkList: g.strokes.map((stroke) => stroke.map((p) => contentToPdfPoint(p, crop))),
      ...visualRect(a, crop),
      ...advisoryRotation(g),
    };
  },
  prop: strokeProps,
  // `/IT` is set at create and never patched (the engine preserves it).
  draftExtras: (a) => (a.intent === 'ink-highlight' ? { intent: a.intent } : {}),
};
