/**
 * The stroke family — line, polygon, polyline, ink. The engine takes their
 * points upright and `rotation` turns them about the middle of their box; it
 * works out `/Rect` from what it draws. The model keeps the points as drawn
 * (with `rot`, the turn they were drawn with), so the seam turns them: a read's
 * upright points are turned onto the page, and an emit turns the model's back
 * (`pageTurnOfDrawn` finds the middle from the drawing alone). A polygon's
 * caption center turns with its points.
 */
import {
  distanceLabel,
  shapeMeasurementLabel,
  geomRotation,
  type ModelAnnotation,
} from '@embedpdf/core-annotation';
import {
  pagePointTurned,
  pagePointUnturned,
  pageTurnOfDrawn,
  pageTurnOfUpright,
  type AnnotationDTO,
  type PagePoint,
  type PagePointTurn,
} from '@embedpdf/engine-core/runtime';

import type { KindProjection, Wire } from '../projection';
import { borderSlice } from '../props';
import { rotFromDTO } from '../seam';

/** The turn a read's upright points are drawn with, or `undefined` upright. */
const turnOfRead = (
  upright: readonly PagePoint[],
  rotation: number | null,
): PagePointTurn | undefined => (rotation ? pageTurnOfUpright(upright, rotation) : undefined);

/** The turn the model's points (as drawn) were drawn with, or `undefined` upright. */
const turnOfModel = (drawn: readonly PagePoint[], rot: number): PagePointTurn | undefined =>
  rot ? pageTurnOfDrawn(drawn, rot) : undefined;

const turned = (point: PagePoint, turn: PagePointTurn | undefined): PagePoint =>
  turn ? pagePointTurned(point, turn) : point;

const unturned = (point: PagePoint, turn: PagePointTurn | undefined): PagePoint =>
  turn ? pagePointUnturned(point, turn) : point;

/** The turn, total: 0 states `null` (tri-state clear) — omission would keep a stale turn. */
const rotationOf = (geometry: ModelAnnotation['geometry']): { rotation: number | null } => {
  const rot = geomRotation(geometry);
  return { rotation: rot ? rot : null };
};

/** `/BE` intensity for a closed poly (polygon): the curls are generated from
 *  /Vertices + /BE alone — per ISO 32000 no /RD applies — and the engine's
 *  `rect` takes in the outward cloud extent. */
const polyCloudy = (annotation: ModelAnnotation): Wire =>
  annotation.geometry.kind === 'poly' && annotation.geometry.closed
    ? {
        cloudyIntensity:
          annotation.style.border.kind === 'cloudy' ? annotation.style.border.intensity : null,
      }
    : {};

/** Stroke-family prop exceptions: a polygon's border states its cloud. */
const strokeProps: KindProjection['prop'] = {
  border: (annotation) => ({
    ...borderSlice(annotation.style),
    ...polyCloudy(annotation),
  }),
  lineEndings: (annotation) =>
    (annotation.geometry.kind === 'line' || annotation.geometry.kind === 'poly') &&
    annotation.geometry.ends
      ? { lineEndings: annotation.geometry.ends }
      : {},
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
      geometry: lineGeometryFromDTO(lineDto),
    };
  },
  geometry: (annotation) => {
    const geometry = annotation.geometry;
    if (geometry.kind !== 'line') return null;
    const drawn = [geometry.a, geometry.b];
    const turn = turnOfModel(drawn, geomRotation(geometry));
    return {
      ...(annotation.measure?.intent === 'line-dimension'
        ? { contents: distanceLabel(geometry, annotation.measure) }
        : {}),
      linePoints: { start: unturned(drawn[0]!, turn), end: unturned(drawn[1]!, turn) },
      ...rotationOf(geometry),
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
    const turn = turnOfRead(polyDto.vertices, polyDto.rotation);
    return {
      ...(polyDto.intent === 'polygon-dimension' || polyDto.intent === 'polyline-dimension'
        ? {
            measure: {
              intent: polyDto.intent,
              measure: polyDto.measure ?? null,
              caption: {
                enabled: polyDto.captionEnabled ?? false,
                ...(polyDto.captionCenter ? { center: turned(polyDto.captionCenter, turn) } : {}),
              },
              text: polyDto.contents ?? '',
            },
          }
        : {}),
      geometry: {
        kind: 'poly',
        points: polyDto.vertices.map((point) => turned(point, turn)),
        closed,
        ...('lineEndings' in polyDto ? { ends: polyDto.lineEndings } : {}),
        ...rotFromDTO(polyDto.rotation),
      },
    };
  },
  geometry: (annotation) => {
    const geometry = annotation.geometry;
    if (geometry.kind !== 'poly') return null;
    const drawn = geometry.points;
    const turn = turnOfModel(drawn, geomRotation(geometry));
    return {
      ...(annotation.measure && annotation.measure.intent !== 'line-dimension'
        ? {
            contents: shapeMeasurementLabel(geometry, annotation.measure),
            ...captionFieldsOf(annotation.measure, turn),
          }
        : {}),
      vertices: drawn.map((point) => unturned(point, turn)),
      ...rotationOf(geometry),
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
    const turn = turnOfRead(inkDto.inkList.flat(), inkDto.rotation);
    return {
      geometry: {
        kind: 'ink',
        strokes: inkDto.inkList.map((stroke) => stroke.map((point) => turned(point, turn))),
        ...rotFromDTO(inkDto.rotation),
      },
      ...(inkDto.intent ? { intent: inkDto.intent } : {}),
    };
  },
  geometry: (annotation) => {
    const geometry = annotation.geometry;
    if (geometry.kind !== 'ink') return null;
    const drawn = geometry.strokes;
    const turn = turnOfModel(drawn.flat(), geomRotation(geometry));
    return {
      inkList: drawn.map((stroke) => stroke.map((point) => unturned(point, turn))),
      ...rotationOf(geometry),
    };
  },
  prop: strokeProps,
  // `/IT` is set at create and never patched (the engine preserves it).
  draftExtras: (annotation) =>
    annotation.intent === 'ink-highlight' ? { intent: annotation.intent } : {},
};

/** A line's model geometry from its read: the upright points turned onto the page. */
function lineGeometryFromDTO(
  lineDto: Extract<AnnotationDTO, { subtype: 'line' }>,
): ModelAnnotation['geometry'] {
  const { start, end } = lineDto.linePoints;
  const turn = turnOfRead([start, end], lineDto.rotation);
  return {
    kind: 'line',
    a: turned(start, turn),
    b: turned(end, turn),
    ends: lineDto.lineEndings,
    ...rotFromDTO(lineDto.rotation),
  };
}

/** The turn a poly's model points were drawn with, or `undefined` upright. */
function modelTurnOf(annotation: ModelAnnotation): PagePointTurn | undefined {
  const geometry = annotation.geometry;
  if (geometry.kind !== 'poly') return undefined;
  return turnOfModel(geometry.points, geomRotation(geometry));
}

/** A measurement's caption fields (none without a measurement), its center turned back upright. */
export function captionFieldsFor(annotation: ModelAnnotation): Record<string, unknown> {
  return annotation.measure ? captionFieldsOf(annotation.measure, modelTurnOf(annotation)) : {};
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
    captionCenter: center ? unturned(center, turn) : null,
  };
}
