/**
 * The points family's kinds — line, polygon, polyline, ink. Their points and
 * turn are read and written by the family (`shapes/points.ts`) as the engine
 * keeps them: upright, with `rotation` turning them about the middle of their
 * box. What a kind adds here is beside its points: a polygon's cloud, the
 * line endings, and a measurement's intent, scale, caption and leader, by the
 * engine's names. The label (`contents`) is the engine's: it works it out
 * from the points and the scale, so it is read, never written.
 */
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import { measurementOf, type MeasurementAppearance } from '../../measurement';
import { readPoints, writePoints, type PointsShape } from '../../shapes/points';
import type { RecordFields } from '../../types';
import type { KindProjection, Wire } from '../projection';
import { borderSlice } from '../props';

type PointsDTO = Extract<AnnotationDTO, { subtype: 'line' | 'polyline' | 'polygon' | 'ink' }>;

/** A measurement's fields, when the annotation is one. */
const measureSlice = (dto: AnnotationDTO): { measure?: MeasurementAppearance } => {
  const measure = measurementOf(dto);
  return measure ? { measure } : {};
};

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
  ingest: (dto) => ({ ...measureSlice(dto), geometry: readPoints(dto as PointsDTO) }),
  geometry: pointsGeometry,
  prop: strokeProps,
  draftExtras: (annotation) =>
    annotation.measure?.intent === 'line-dimension'
      ? { ...measurementDraftOf(annotation.measure), subject: 'Distance' }
      : {},
};

const polyProjection = (closed: boolean): KindProjection => ({
  ingest: (dto) => ({ ...measureSlice(dto), geometry: readPoints(dto as PointsDTO) }),
  geometry: pointsGeometry,
  prop: strokeProps,
  draftExtras: (annotation) =>
    annotation.measure && annotation.measure.intent !== 'line-dimension'
      ? { ...measurementDraftOf(annotation.measure), subject: closed ? 'Area' : 'Perimeter' }
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

/** The caption and leader fields of a measurement a change states: those it has, never its label. */
function captionFieldsOf(measure: MeasurementAppearance): Wire {
  const fields: Wire =
    measure.intent === 'line-dimension'
      ? {
          captionEnabled: measure.captionEnabled,
          captionPosition: measure.captionPosition,
          captionOffset: measure.captionOffset,
          leader: measure.leader,
        }
      : { captionEnabled: measure.captionEnabled };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

/** A record's measurement caption and leader, as a change states them (none without a measurement). */
export const captionFieldsFor = (annotation: RecordFields): Wire =>
  annotation.measure ? captionFieldsOf(annotation.measure) : {};

/** What a new measurement states beside its points: its intent, its scale (one the engine can write), caption and leader. */
const measurementDraftOf = (measure: MeasurementAppearance): Wire => ({
  intent: measure.intent,
  measure: measure.measure?.subtype === 'rectilinear' ? measure.measure : null,
  ...captionFieldsOf(measure),
});
