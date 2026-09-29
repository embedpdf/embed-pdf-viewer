/**
 * The quads family: text markup (highlight, underline, squiggly, strikeout)
 * and text redaction. Its shape is the engine's own field, `quadPoints`: one
 * quad per line of text, corners named as the text stands. The quads follow
 * their text, so no gesture resizes or turns them; a hit anywhere inside a
 * quad grabs the mark.
 */
import { quadCorners, quadRing, type Quad } from '@embedpdf/core-geometry';
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import { expandRect, pointInPoly, unionRect } from '../rect';
import type { Point, Rect, RenderNode } from '../types';

/** A quads family record's shape: its text's quads. */
export interface QuadsShape {
  kind: 'quads';
  quadPoints: Quad[];
}

/** A text markup's or text redaction's shape, read off its annotation. */
export function readQuads(
  annotation: Extract<
    AnnotationDTO,
    { subtype: 'highlight' | 'underline' | 'squiggly' | 'strikeout' | 'redact' }
  >,
): QuadsShape {
  return { kind: 'quads', quadPoints: annotation.quadPoints };
}

/** The box around the quads. */
export const quadsBounds = (shape: QuadsShape): Rect =>
  unionRect(shape.quadPoints.flatMap(quadCorners));

/** What the marks draw: the quads, grown by half the stroke (an underline's or squiggle's). */
export const quadsDrawnBounds = (shape: QuadsShape, strokeWidth: number): Rect =>
  expandRect(quadsBounds(shape), strokeWidth / 2);

/** The middle of the quads' corners. */
export function quadsCentroid(shape: QuadsShape): Point {
  const points = shape.quadPoints.flatMap(quadCorners);
  const count = points.length || 1;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / count,
    y: points.reduce((sum, point) => sum + point.y, 0) / count,
  };
}

/** Map a quad's corners through `move` (the names ride along). */
const mapQuad = (quad: Quad, move: (point: Point) => Point): Quad => ({
  upperLeft: move(quad.upperLeft),
  upperRight: move(quad.upperRight),
  lowerLeft: move(quad.lowerLeft),
  lowerRight: move(quad.lowerRight),
});

/** The shape moved by `delta`. */
export function quadsTranslate(shape: QuadsShape, delta: Point): QuadsShape {
  const move = (point: Point): Point => ({ x: point.x + delta.x, y: point.y + delta.y });
  return { ...shape, quadPoints: shape.quadPoints.map((quad) => mapQuad(quad, move)) };
}

/**
 * Is `point` inside any quad? Quad rings are simple (never self-crossing) by
 * construction, so the point-in-polygon test is exact for turned text too.
 */
export const quadsHit = (shape: QuadsShape, point: Point): boolean =>
  shape.quadPoints.some((quad) => pointInPoly(point, quadRing(quad)));

/**
 * A closed ring per quad (upper left round to lower left). The markup
 * painter draws each subtype from the quads itself; this keeps the generic
 * scene right regardless, turned text included.
 */
export const quadsScene = (shape: QuadsShape): RenderNode[] =>
  shape.quadPoints.map((quad) => ({ kind: 'poly', points: quadRing(quad), closed: true }));
