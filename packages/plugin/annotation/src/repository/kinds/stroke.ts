/**
 * The stroke family — line, polygon, polyline, ink. Shared physics: their
 * `/Rect` is the visual bounds (stroke radius included — and, for a cloudy
 * polygon, the outward curl extent), so it derives from the point geometry
 * plus the stroke width, border, and line endings; and their
 * `/EMBD_Metadata/Rotation` is an advisory scalar (the points are already
 * rotated; shape measurement captions use it to orient their text).
 */
import {
  distanceLabel,
  measurementLayout,
  shapeMeasurementLabel,
  geomPdfBounds,
  geomRotation,
  pdfToContentPoint,
  type ModelAnnotation,
} from '@embedpdf/core-annotation';
import type { AnnotationDTO, PdfRect } from '@embedpdf/engine-core/runtime';

import type { KindProjection, Wire } from '../projection';
import { borderSlice } from '../props';
import { contentToPdfPoint, contentToPdfRect, rotFromDTO, toPdfRotation } from '../seam';

/** Advisory rotation, total: rotation 0 states `null` (tri-state clear) —
 *  omission would preserve a stale advisory angle. */
const advisoryRotation = (geometry: ModelAnnotation['geometry']): { rotation: number | null } => {
  const rot = geomRotation(geometry);
  return { rotation: rot ? toPdfRotation(rot) : null };
};

/** `/BE` intensity for a closed poly (polygon): the curls are generated from
 *  /Vertices + /BE alone — per ISO 32000 no /RD applies — and the /Rect
 *  (geomPdfBounds with the border) already includes the outward cloud extent. */
const polyCloudy = (annotation: ModelAnnotation): Wire =>
  annotation.geometry.kind === 'poly' && annotation.geometry.closed
    ? {
        cloudyIntensity:
          annotation.style.border.kind === 'cloudy' ? annotation.style.border.intensity : null,
      }
    : {};

/** The visual-bounds `/Rect` (stroke + border included) of a stroke geom. */
const visualRect = (annotation: ModelAnnotation, crop: PdfRect): Wire => {
  const geometry = annotation.geometry;
  if (annotation.measure) {
    const bounds = measurementLayout(geometry, annotation.measure, annotation.style)?.visualBounds;
    if (bounds) {
      return { rect: contentToPdfRect(bounds, crop) };
    }
  }
  if (geometry.kind === 'line' || geometry.kind === 'ink')
    return { rect: geomPdfBounds(geometry, annotation.style.strokeWidth, crop) };
  if (geometry.kind === 'poly')
    return {
      rect: geomPdfBounds(geometry, annotation.style.strokeWidth, crop, annotation.style.border),
    };
  return {};
};

/**
 * A lowering whose key is an input of the derived /Rect: the visual bounds
 * ride along with every emission, so a sparse patch can never change an input
 * without re-emitting the derivation. (The bug this kills: patch `lineEndings`
 * alone → the engine re-bakes the /AP inside the stale /Rect → the new
 * arrowhead is clipped in every viewer except the live vector one.)
 */
const withRect =
  (lower: (annotation: ModelAnnotation, crop: PdfRect) => Wire) =>
  (annotation: ModelAnnotation, crop: PdfRect): Wire => ({
    ...lower(annotation, crop),
    ...visualRect(annotation, crop),
  });

/** Stroke-family prop exceptions: width, border, and line endings feed the
 *  derived /Rect — an ending's arrowhead reaches well past the endpoint, and
 *  ISO 32000 requires /Rect to enclose it. Where a key can't change the
 *  bounds (a line's border restyle), the re-emitted rect is an idempotent
 *  no-op — uniformity beats per-case reasoning here. */
const strokeProps: KindProjection['prop'] = {
  strokeWidth: withRect((annotation) => ({ strokeWidth: annotation.style.strokeWidth })),
  border: withRect((annotation) => ({
    ...borderSlice(annotation.style),
    ...polyCloudy(annotation),
  })),
  lineEndings: withRect((annotation) =>
    (annotation.geometry.kind === 'line' || annotation.geometry.kind === 'poly') &&
    annotation.geometry.ends
      ? { lineEndings: annotation.geometry.ends }
      : {},
  ),
};

export const line: KindProjection = {
  ingest: (dto, crop) => {
    const lineDto = dto as Extract<AnnotationDTO, { subtype: 'line' }>;
    return {
      ...(lineDto.intent === 'line-dimension'
        ? {
            measure: {
              intent: lineDto.intent,
              measure: lineDto.measure ?? null,
              caption: {
                enabled: lineDto.captionEnabled ?? false,
                position: lineDto.captionPosition,
                ...(lineDto.captionOffset ? { offset: lineDto.captionOffset } : {}),
              },
              leader: lineDto.leader ?? undefined,
              crop,
              text: lineDto.contents ?? '',
            },
          }
        : {}),
      geometry: {
        kind: 'line',
        a: pdfToContentPoint(lineDto.linePoints.start, crop),
        b: pdfToContentPoint(lineDto.linePoints.end, crop),
        ends: lineDto.lineEndings,
        ...rotFromDTO(lineDto.rotation),
      },
    };
  },
  geometry: (annotation, crop) => {
    const geometry = annotation.geometry;
    if (geometry.kind !== 'line') return null;
    return {
      ...(annotation.measure?.intent === 'line-dimension'
        ? { contents: distanceLabel(geometry, annotation.measure) }
        : {}),
      linePoints: {
        start: contentToPdfPoint(geometry.a, crop),
        end: contentToPdfPoint(geometry.b, crop),
      },
      ...visualRect(annotation, crop),
      ...advisoryRotation(geometry),
    };
  },
  prop: strokeProps,
  draftExtras: (annotation) =>
    annotation.measure?.intent === 'line-dimension'
      ? {
          intent: annotation.measure.intent,
          measure:
            annotation.measure.measure?.subtype === 'rectilinear'
              ? annotation.measure.measure
              : null,
          ...captionFieldsOf(annotation.measure),
          leader: annotation.measure.leader,
          subject: 'Distance',
        }
      : {},
};

const polyProjection = (closed: boolean): KindProjection => ({
  ingest: (dto, crop) => {
    const polyDto = dto as Extract<AnnotationDTO, { subtype: 'polygon' | 'polyline' }>;
    return {
      ...(polyDto.intent === 'polygon-dimension' || polyDto.intent === 'polyline-dimension'
        ? {
            measure: {
              intent: polyDto.intent,
              measure: polyDto.measure ?? null,
              caption: {
                enabled: polyDto.captionEnabled ?? false,
                ...(polyDto.captionCenter ? { center: polyDto.captionCenter } : {}),
              },
              crop,
              text: polyDto.contents ?? '',
            },
          }
        : {}),
      geometry: {
        kind: 'poly',
        points: polyDto.vertices.map((pdfPoint) => pdfToContentPoint(pdfPoint, crop)),
        closed,
        ...('lineEndings' in polyDto ? { ends: polyDto.lineEndings } : {}),
        ...rotFromDTO(polyDto.rotation),
      },
    };
  },
  geometry: (annotation, crop) => {
    const geometry = annotation.geometry;
    if (geometry.kind !== 'poly') return null;
    return {
      ...(annotation.measure && annotation.measure.intent !== 'line-dimension'
        ? {
            contents: shapeMeasurementLabel(geometry, annotation.measure),
            ...captionFieldsOf(annotation.measure),
          }
        : {}),
      vertices: geometry.points.map((point) => contentToPdfPoint(point, crop)),
      ...visualRect(annotation, crop),
      ...advisoryRotation(geometry),
    };
  },
  prop: strokeProps,
  draftExtras: (annotation) =>
    annotation.measure && annotation.measure.intent !== 'line-dimension'
      ? {
          intent: annotation.measure.intent,
          measure:
            annotation.measure.measure?.subtype === 'rectilinear'
              ? annotation.measure.measure
              : null,
          ...captionFieldsOf(annotation.measure),
          subject: closed ? 'Area' : 'Perimeter',
        }
      : {},
});

export const polygon: KindProjection = polyProjection(true);
export const polyline: KindProjection = polyProjection(false);

export const ink: KindProjection = {
  ingest: (dto, crop) => {
    const inkDto = dto as Extract<AnnotationDTO, { subtype: 'ink' }>;
    return {
      geometry: {
        kind: 'ink',
        strokes: inkDto.inkList.map((stroke) =>
          stroke.map((pdfPoint) => pdfToContentPoint(pdfPoint, crop)),
        ),
        ...rotFromDTO(inkDto.rotation),
      },
      ...(inkDto.intent ? { intent: inkDto.intent } : {}),
    };
  },
  geometry: (annotation, crop) => {
    const geometry = annotation.geometry;
    if (geometry.kind !== 'ink') return null;
    return {
      inkList: geometry.strokes.map((stroke) =>
        stroke.map((point) => contentToPdfPoint(point, crop)),
      ),
      ...visualRect(annotation, crop),
      ...advisoryRotation(geometry),
    };
  },
  prop: strokeProps,
  // `/IT` is set at create and never patched (the engine preserves it).
  draftExtras: (annotation) =>
    annotation.intent === 'ink-highlight' ? { intent: annotation.intent } : {},
};

/**
 * The model keeps a measurement's caption as one value; the engine takes its
 * parts as separate fields. A line's caption has a position and an offset, a
 * shape's a center.
 */
export function captionFieldsOf(measure: {
  intent: string;
  caption: { enabled: boolean; position?: 'inline' | 'top'; offset?: unknown; center?: unknown };
}): Record<string, unknown> {
  const { caption } = measure;
  return measure.intent === 'line-dimension'
    ? {
        captionEnabled: caption.enabled,
        captionPosition: caption.position ?? 'inline',
        captionOffset: caption.offset ?? null,
      }
    : { captionEnabled: caption.enabled, captionCenter: caption.center ?? null };
}
