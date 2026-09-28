import { semanticEqual } from './appearance';
import { ANNOTATION_FIELD_SPACES, type MeasuredFieldSpace } from './field-spaces';
import type { AnnotationDTO } from './kinds';
import type { AnnotationSubtype } from './subtype';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { normalizePdfRect } from '../geometry/convert';
import type { PdfPoint, PdfQuad, PdfRect } from '../geometry/primitives';

/**
 * The kinds whose `rect` the engine works out from their shape: a box, points
 * or quads (`drawnRectFields`). `test/annotation/shapeForRect.test.ts` keeps
 * it equal to the declarations.
 */
export const DRAWN_RECT_KINDS: ReadonlySet<AnnotationSubtype> = new Set([
  'highlight',
  'underline',
  'squiggly',
  'strikeout',
  'square',
  'circle',
  'free-text',
  'stamp',
  'caret',
  'line',
  'polyline',
  'polygon',
  'ink',
]);

/**
 * The places that make up a drawing. A measurement's origin isn't one: it's
 * where the scale's coordinates start, so it stays when the drawing moves.
 */
const DRAWING_SPACES: ReadonlySet<MeasuredFieldSpace> = new Set([
  'box',
  'point',
  'points',
  'strokes',
  'quads',
  'linePoints',
  'calloutLine',
]);

/** The fields that hold a drawn kind's shape: its places, and its turn. */
export function shapeFieldsOf(subtype: AnnotationSubtype): string[] {
  const places = Object.entries(ANNOTATION_FIELD_SPACES[subtype])
    .filter(([name, space]) => name !== 'rect' && DRAWING_SPACES.has(space))
    .map(([name]) => name);
  return [...places, 'rotation'];
}

/**
 * The shape fields that put `annotation` at `rect`, the rule an update's
 * `rect` follows (`create({ ...copy, ...shapeForRect(copy, target) })` puts a
 * copy there).
 *
 * - A kind whose shape is its rect (note, file attachment, link, popup,
 *   widget, redaction) takes `rect` as it is.
 * - A drawn kind has every place it holds mapped from its current `rect` onto
 *   `rect`, each axis on its own, as Acrobat does when a script sets
 *   `annot.rect`: a rect of the same size moves the shape, a bigger one
 *   stretches it. The engine then works out the rect from the shape, so it
 *   can differ a little from `rect` (a stroke keeps its width).
 *
 * A drawn kind refuses a rect that would squash it to no width or height, and
 * a rect of another size when it's turned (it can only move) or when its own
 * rect has no width or height to stretch. Each refusal is `InvalidArg` on
 * `rect`.
 */
export function shapeForRect<A extends AnnotationDTO>(annotation: A, rect: PdfRect): Partial<A> {
  const subtype = annotation.subtype;
  if (!DRAWN_RECT_KINDS.has(subtype)) return { rect } as Partial<A>;

  const to = normalizePdfRect(rect);
  const from = normalizePdfRect(annotation.rect);
  const toWidth = to.right - to.left;
  const toHeight = to.top - to.bottom;
  const fromWidth = from.right - from.left;
  const fromHeight = from.top - from.bottom;
  const sameWidth = semanticEqual(toWidth, fromWidth);
  const sameHeight = semanticEqual(toHeight, fromHeight);
  if ((!sameWidth && toWidth <= 0) || (!sameHeight && toHeight <= 0)) {
    throw refused(subtype, 'a rect needs a width and a height');
  }
  const rotation = (annotation as { rotation?: number | null }).rotation;
  if (rotation && !semanticEqual(((rotation % 360) + 360) % 360, 0)) {
    if (!sameWidth || !sameHeight) {
      throw refused(subtype, "a turned drawing's rect can only move; resize its shape instead");
    }
  }
  if ((!sameWidth && fromWidth <= 0) || (!sameHeight && fromHeight <= 0)) {
    throw refused(subtype, 'its rect has no width or height to stretch; it can only move');
  }

  const scaleX = sameWidth ? 1 : toWidth / fromWidth;
  const scaleY = sameHeight ? 1 : toHeight / fromHeight;
  const point = (p: PdfPoint): PdfPoint => ({
    x: to.left + (p.x - from.left) * scaleX,
    y: to.bottom + (p.y - from.bottom) * scaleY,
  });
  const place: Partial<Record<MeasuredFieldSpace, (value: never) => unknown>> = {
    box: (box: PdfRect) => {
      const corner = point({ x: box.left, y: box.bottom });
      const opposite = point({ x: box.right, y: box.top });
      return normalizePdfRect({
        left: corner.x,
        bottom: corner.y,
        right: opposite.x,
        top: opposite.y,
      });
    },
    point,
    points: (points: PdfPoint[]) => points.map(point),
    strokes: (strokes: PdfPoint[][]) => strokes.map((stroke) => stroke.map(point)),
    quads: (quads: PdfQuad[]) =>
      quads.map((quad) => ({
        p1: point(quad.p1),
        p2: point(quad.p2),
        p3: point(quad.p3),
        p4: point(quad.p4),
      })),
    linePoints: (line: { start: PdfPoint; end: PdfPoint }) => ({
      start: point(line.start),
      end: point(line.end),
    }),
    calloutLine: (points: PdfPoint[]) => points.map(point),
  };

  const spaces = ANNOTATION_FIELD_SPACES[subtype];
  const shape: Record<string, unknown> = {};
  for (const name of shapeFieldsOf(subtype)) {
    const value = (annotation as unknown as Record<string, unknown>)[name];
    const space = spaces[name];
    if (value != null && space) shape[name] = place[space]!(value as never);
  }
  return shape as Partial<A>;
}

function refused(subtype: string, reason: string): EngineError {
  return new EngineError(EngineErrorCode.InvalidArg, `${subtype} field 'rect': ${reason}`, {
    details: { field: 'rect' },
  });
}
