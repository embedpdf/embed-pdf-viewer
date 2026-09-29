/**
 * The points family's kinds — line, polygon, polyline, ink. Their points and
 * turn are read and written by the family (`shapes/points.ts`) as the engine
 * keeps them: upright, with `rotation` turning them about the middle of their
 * box. What a kind adds here is beside its points: a polygon's cloud, the
 * line endings, and a measurement's caption and label. The model keeps a
 * polygon measurement's caption center where it is drawn; the engine takes
 * it upright with the points, so it is turned back with them.
 */
import {
  pagePointTurned,
  pagePointUnturned,
  pageTurnOfUpright,
  type AnnotationDTO,
  type PagePoint,
  type PagePointTurn,
} from '@embedpdf/engine-core/runtime';

import { distanceLabel } from '../../measurement';
import { shapeMeasurementLabel } from '../../measurement-shape';
import { readPoints, uprightStrokesOf, writePoints, type PointsShape } from '../../shapes/points';
import type { RecordFields } from '../../types';
import type { KindProjection, Wire } from '../projection';
import { borderSlice } from '../props';

type PointsDTO = Extract<AnnotationDTO, { subtype: 'line' | 'polyline' | 'polygon' | 'ink' }>;

/** The turn that draws a shape's upright points, or `undefined` upright. */
const turnOf = (shape: PointsShape): PagePointTurn | undefined =>
  shape.rotation ? pageTurnOfUpright(uprightStrokesOf(shape).flat(), shape.rotation) : undefined;

/** A points record's shape, or `undefined` for any other geometry. */
const pointsOf = (annotation: RecordFields): PointsShape | undefined => {
  const geometry = annotation.geometry;
  return geometry.kind === 'line' || geometry.kind === 'poly' || geometry.kind === 'ink'
    ? geometry
    : undefined;
};

/** `/BE` intensity for a closed poly (polygon): the curls are generated from
 *  /Vertices + /BE alone — per ISO 32000 no /RD applies — and the engine's
 *  `rect` takes in the outward cloud extent. */
const polyCloudy = (annotation: RecordFields): Wire =>
  annotation.geometry.kind === 'poly' && annotation.geometry.closed
    ? {
        cloudyIntensity:
          annotation.style.border.kind === 'cloudy' ? annotation.style.border.intensity : null,
      }
    : {};

/** Points-family prop exceptions: a polygon's border states its cloud. */
const strokeProps: KindProjection['prop'] = {
  border: (annotation) => ({
    ...borderSlice(annotation.style),
    ...polyCloudy(annotation),
  }),
  lineEndings: (annotation) =>
    (annotation.geometry.kind === 'line' || annotation.geometry.kind === 'poly') &&
    annotation.geometry.lineEndings
      ? { lineEndings: annotation.geometry.lineEndings }
      : {},
};

/** The engine fields that state a points record's shape. */
const pointsGeometry = (annotation: RecordFields): Wire | null => {
  const shape = pointsOf(annotation);
  return shape ? writePoints(shape) : null;
};

export const line: KindProjection = {
  ingest: (dto) => {
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
              text: lineDto.contents ?? '',
            },
          }
        : {}),
      geometry: readPoints(lineDto),
    };
  },
  geometry: (annotation) => {
    const geometry = annotation.geometry;
    if (geometry.kind !== 'line') return null;
    return {
      ...(annotation.measure?.intent === 'line-dimension'
        ? { contents: distanceLabel(geometry, annotation.measure) }
        : {}),
      ...writePoints(geometry),
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
  ingest: (dto) => {
    const polyDto = dto as Extract<AnnotationDTO, { subtype: 'polygon' | 'polyline' }>;
    const shape = readPoints(polyDto);
    const turn = turnOf(shape);
    const center = polyDto.captionCenter;
    return {
      ...(polyDto.intent === 'polygon-dimension' || polyDto.intent === 'polyline-dimension'
        ? {
            measure: {
              intent: polyDto.intent,
              measure: polyDto.measure ?? null,
              caption: {
                enabled: polyDto.captionEnabled ?? false,
                ...(center ? { center: turn ? pagePointTurned(center, turn) : center } : {}),
              },
              text: polyDto.contents ?? '',
            },
          }
        : {}),
      geometry: shape,
    };
  },
  geometry: (annotation) => {
    const geometry = annotation.geometry;
    if (geometry.kind !== 'poly') return null;
    return {
      ...(annotation.measure && annotation.measure.intent !== 'line-dimension'
        ? {
            contents: shapeMeasurementLabel(geometry, annotation.measure),
            ...captionFieldsOf(annotation.measure, turnOf(geometry)),
          }
        : {}),
      ...writePoints(geometry),
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
          ...captionFieldsFor(annotation),
          subject: closed ? 'Area' : 'Perimeter',
        }
      : {},
});

export const polygon: KindProjection = polyProjection(true);
export const polyline: KindProjection = polyProjection(false);

export const ink: KindProjection = {
  ingest: (dto) => {
    const inkDto = dto as Extract<AnnotationDTO, { subtype: 'ink' }>;
    return {
      geometry: readPoints(inkDto as PointsDTO),
      ...(inkDto.intent ? { intent: inkDto.intent } : {}),
    };
  },
  geometry: pointsGeometry,
  prop: strokeProps,
  // `/IT` is set at create and never patched (the engine preserves it).
  draftExtras: (annotation) =>
    annotation.intent === 'ink-highlight' ? { intent: annotation.intent } : {},
};

/** A measurement's caption fields (none without a measurement), its center turned back upright. */
export function captionFieldsFor(annotation: RecordFields): Record<string, unknown> {
  if (!annotation.measure) return {};
  const shape = pointsOf(annotation);
  return captionFieldsOf(annotation.measure, shape && turnOf(shape));
}

/**
 * The model keeps a measurement's caption as one value; the engine takes its
 * parts as separate fields. A line's caption has a position and an offset, a
 * shape's a center, which the model keeps as drawn and the engine takes
 * upright with the points: `turn` turns it back.
 */
function captionFieldsOf(
  measure: {
    intent: string;
    caption: { enabled: boolean; position?: 'inline' | 'top'; offset?: unknown; center?: unknown };
  },
  turn?: PagePointTurn,
): Record<string, unknown> {
  const { caption } = measure;
  if (measure.intent === 'line-dimension') {
    return {
      captionEnabled: caption.enabled,
      captionPosition: caption.position ?? 'inline',
      captionOffset: caption.offset ?? null,
    };
  }
  const center = caption.center as PagePoint | undefined;
  return {
    captionEnabled: caption.enabled,
    captionCenter: center ? (turn ? pagePointUnturned(center, turn) : center) : null,
  };
}
