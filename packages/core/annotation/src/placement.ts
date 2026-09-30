/**
 * Where a create gesture puts what it makes — the pure, plane-agnostic layer.
 *
 * A create tool answers one question: if the gesture ended now, what would
 * exist? `gesturePlacement` answers the "where": past the drag threshold, the
 * dragged box or segment; under it, the tool's click default
 * (`resolveClickPlacement`). `placedShape` answers the "what": the kind's
 * shape family lays its shape there. The commit, the drawing in progress and
 * the tool's ghost all make these two calls, so a ghost shows what a click
 * makes by construction. A form field takes the placed box as its bounds.
 */
import type { PageRotation } from '@embedpdf/core-geometry';
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import { uprightAnchoredRect, uprightRotation } from './geometry';
import { kindOf } from './record';
import { rectFromPoints, rotatePoint, transposedAboutCenter } from './rect';
import type { ClickCreate, Placement, Point, Rect, Shape } from './types';
import { clampPointToBox } from './update/page-bound';

/** The click ↔ drag threshold (content units): a press-release that stays
 *  under it is a click. Every gesture owner (the draw handler, the form
 *  plugin's place handler) shares this one definition. */
export const MIN_DRAG = 3;

/** What a create gesture lays: a box (shapes, text boxes, form fields) or a segment (lines). */
export type GestureForm = 'box' | 'segment';

/** The page a placement is made on, and how the person sees it. */
export interface PlacementFrame {
  /** The page's content box: a placement slides inside it. */
  pageBox?: Rect;
  /** Lay it out as the person sees the page: the tool's `upright`. */
  upright?: boolean;
  /** How far the page shows turned (document /Rotate + view rotation, degrees clockwise). */
  displayRotation?: PageRotation;
}

/** Slide a rect (as a unit) to sit inside `box`; pins at the origin edge when
 *  it doesn't fit. Placements are page-bound; the pointer isn't. */
export const clampRectToBox = (rect: Rect, box: Rect | undefined): Rect => {
  if (!box) return rect;
  return {
    ...rect,
    x: Math.min(Math.max(rect.x, box.x), Math.max(box.x, box.x + box.width - rect.width)),
    y: Math.min(Math.max(rect.y, box.y), Math.max(box.y, box.y + box.height - rect.height)),
  };
};

/** Whether a gesture from `from` to `to` is a drag: a segment once it is
 *  `MIN_DRAG` long, a box once either side is. */
export function isDrag(form: GestureForm, from: Point, to: Point): boolean {
  if (form === 'segment') return Math.hypot(to.x - from.x, to.y - from.y) >= MIN_DRAG;
  return Math.abs(to.x - from.x) >= MIN_DRAG || Math.abs(to.y - from.y) >= MIN_DRAG;
}

/** The turn an upright tool gives a box on a page shown turned: that turn undone. */
const uprightTurn = ({ upright, displayRotation }: PlacementFrame): number =>
  upright && displayRotation ? uprightRotation(displayRotation) : 0;

/**
 * Where a create gesture from `from` to `to` puts what it makes: the dragged
 * box or segment once it is a drag, else the tool's click default at `from`
 * (`null` when a click makes nothing). A drag stays on the page: its points
 * pin to the edge. An upright drag keeps the region the author dragged: under
 * a quarter turn the box before its turn is the dragged one with its sides
 * swapped about its middle, so the turn lands it back on that region.
 */
export function gesturePlacement(
  form: GestureForm,
  from: Point,
  to: Point,
  clickCreate: ClickCreate | false | undefined,
  frame: PlacementFrame = {},
): Placement | null {
  if (!isDrag(form, from, to)) {
    return clickCreate ? resolveClickPlacement(from, clickCreate, frame) : null;
  }
  const a = frame.pageBox ? clampPointToBox(from, frame.pageBox) : from;
  const b = frame.pageBox ? clampPointToBox(to, frame.pageBox) : to;
  if (form === 'segment') return { kind: 'segment', a, b };
  const rot = uprightTurn(frame);
  const dragged = rectFromPoints(a, b);
  return { kind: 'box', rect: rot % 180 ? transposedAboutCenter(dragged) : dragged, rot };
}

/**
 * Where a bare click at `point` puts what the tool makes (see
 * {@link ClickCreate}), slid inside the page. Under `upright` it is laid out
 * as the person sees the page: a line's direction and a box's top-left corner
 * are the screen's, and a box turns to read upright, showing `width` ×
 * `height` as configured.
 */
export function resolveClickPlacement(
  point: Point,
  policy: ClickCreate,
  frame: PlacementFrame = {},
): Placement {
  // How far the person sees the page turned, for an upright tool.
  const seen = frame.upright ? (frame.displayRotation ?? 0) : 0;
  if ('length' in policy) {
    const turn = ((policy.rotation ?? 0) * Math.PI) / 180;
    // The line as the person sees it, turned back into page space.
    const span = rotatePoint(
      { x: Math.cos(turn) * policy.length, y: Math.sin(turn) * policy.length },
      { x: 0, y: 0 },
      -seen,
    );
    // How much of the line lies before the click: none from its start, all to its end.
    const before = policy.anchor === 'start' ? 0 : policy.anchor === 'end' ? 1 : 0.5;
    const a = { x: point.x - span.x * before, y: point.y - span.y * before };
    const b = { x: a.x + span.x, y: a.y + span.y };
    const bounds = rectFromPoints(a, b);
    const placed = clampRectToBox(bounds, frame.pageBox);
    const dx = placed.x - bounds.x;
    const dy = placed.y - bounds.y;
    return { kind: 'segment', a: { x: a.x + dx, y: a.y + dy }, b: { x: b.x + dx, y: b.y + dy } };
  }
  const { width, height } = policy;
  const rot = uprightTurn(frame);
  const rect =
    policy.anchor === 'top-left'
      ? uprightAnchoredRect(point, width, height, seen)
      : { x: point.x - width / 2, y: point.y - height / 2, width, height };
  // What the page shows is the box turned by `rot` (a quarter turn swaps its
  // sides): slide that inside the page, and the box with it.
  const shown = rot % 180 ? transposedAboutCenter(rect) : rect;
  const placed = clampRectToBox(shown, frame.pageBox);
  return {
    kind: 'box',
    rect: { ...rect, x: rect.x + placed.x - shown.x, y: rect.y + placed.y - shown.y },
    rot,
  };
}

/**
 * What a create from a tool makes at `placement`: its kind's shape there, as
 * the kind's shape family lays it (`ShapeFamily.placed`), or `null` when the
 * kind can't be made that way (a line from a box). `annotation` is what the
 * tool creates before it has a shape (`toolAnnotation`): its kind, and what
 * the shape takes from it (a line's endings, a circle's roundness).
 */
export function placedShape(annotation: AnnotationDTO, placement: Placement): Shape | null {
  return kindOf(annotation).family.placed(placement, annotation);
}
