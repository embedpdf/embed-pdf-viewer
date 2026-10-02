import type { PageRef } from '@embedpdf/engine-core/runtime';
import { annotationSelectionFrame, annotationTurnPivot } from './selection';
import {
  captionPainted,
  distanceCaptionHit,
  distanceHandles,
  distanceLayout,
  distancePainted,
  measurementOf,
} from './measurement';
import { measurementLayout } from './measurement-shape';
import { geomHandles, geomPainted, placeRotateKnob, pointInQuad, rectHandlesFor } from './geometry';
import { cursorOnScreen, unionRect } from './rect';
import { groupCaps } from './group';
import { isSubstrateOnly } from './plane';
import { annotInteractive, annotTransformable, viewable } from './flags';
import { anchoredGeom, anchoredStrokeWidth, anchorModeOf, type ViewEnv } from './anchor';
import { paintedNear, type PaintedPiece } from './painted';
import {
  type ModelAnnotation,
  type ChromeGeometry,
  type Cursor,
  type Shape,
  type Id,
  type Model,
  type Rect,
  type Point,
} from './types';
import { kindOf, shapeOf, styleOf } from './record';
import { isInTurnedBox } from './shapes/box';

export type Target =
  | { kind: 'handle'; id: Id; handle: string; cursor: Cursor }
  // The rotate knob of the current selection (single shape or multi-target
  // group). `pivot` is the rotation centre the gesture turns about.
  | { kind: 'rotate'; ids: Id[]; pivot: Point }
  // A resize handle of the multi-target group box (the union box of the
  // selection). `box` is that union box; `ids` the members it scales.
  | { kind: 'group-handle'; ids: Id[]; handle: string; cursor: Cursor; box: Rect }
  | { kind: 'annot'; id: Id }
  | { kind: 'empty' };

/** Page annotation ids in paint order (back→front): text-layer markups first
 *  (always beneath), then every other kind, each group preserving creation
 *  z-order. The one z-order shared by rendering (`pageItems`) and hit-testing —
 *  and the one visibility cull: what `/F` hides (hidden / un-engaged noView)
 *  neither paints nor hits, so an invisible annotation can never eat a click.
 *  Conversation-plane annotations (replies, review-status states) are culled
 *  here too — dialogue lives in the comments UI, never on the page. */
export function paintOrder(model: Model, page: PageRef): Id[] {
  const pageObjectNumber = page.objectNumber;
  const markup: Id[] = [];
  const other: Id[] = [];
  for (const id of model.order) {
    const record = model.byId[id];
    if (!record || record.annotation.page.objectNumber !== pageObjectNumber) continue;
    if (!viewable(record.annotation, model.selected.includes(id))) continue;
    if (isSubstrateOnly(record)) continue;
    (kindOf(record.annotation).caps.paintsBeneath ? markup : other).push(id);
  }
  return [...markup, ...other];
}

/** Can this annotation be clicked to select? (`/F` interaction flags override
 *  all caps — hidden/noView/readOnly are inert; locked stays selectable, it
 *  just won't transform.) */
export const isSelectable = (model: Model, id: Id): boolean => {
  const record = model.byId[id];
  return !!record && annotInteractive(record) && kindOf(record.annotation).caps.selectable;
};

/** An anchored kind's quad geometry is bound to underlying text — never moved
 *  or resized. This is what lets one caps set serve both redaction shapes:
 *  area marks (rect geometry) keep their transforms, text marks (quads) are
 *  as fixed as classic markup. Markup kinds themselves have `movable: false`
 *  and never reach this gate. */
const textBound = (record: ModelAnnotation): boolean =>
  kindOf(record.annotation).caps.anchored && shapeOf(record.annotation).kind === 'quads';

/** Can this annotation be dragged by its body to move? (`locked` freezes it.) */
export const canMove = (model: Model, id: Id): boolean => {
  const record = model.byId[id];
  return (
    !!record &&
    annotTransformable(record) &&
    kindOf(record.annotation).caps.movable &&
    !textBound(record)
  );
};

/** Does this kind expose drag handles (box resize or per-vertex)? Only
 *  `locked` (and inert `/F` states) suppress them at runtime — a
 *  screen-anchored body keeps its handles: `noZoom`/`noRotate` exempt it from
 *  the display transform, they don't freeze its size or vertices. */
const hasHandles = (model: Model, record: ModelAnnotation): boolean => {
  if (!annotTransformable(record) || textBound(record)) return false;
  const caps = kindOf(record.annotation).caps;
  return caps.resizable || caps.vertexEditable;
};

/** The geometry a pointer actually meets: the anchored (screen-constant)
 *  projection for `noZoom`/`noRotate` annotations, the stored geom otherwise.
 *  The same projection `pageItems` renders, so click matches paint. */
const hitGeomOf = (record: ModelAnnotation, view: ViewEnv | undefined): Shape =>
  anchoredGeom(shapeOf(record.annotation), anchorModeOf(record), view);

/**
 * What an annotation paints where the pointer meets it (`painted.ts`): its
 * shape's pieces, projected as a screen-anchored body shows at `view`, and a
 * measurement's caption, dimension line and leaders. A click and the marquee
 * both read this.
 */
export function paintedOf(record: ModelAnnotation, view?: ViewEnv): readonly PaintedPiece[] {
  const style = styleOf(record.annotation);
  const measure = measurementOf(record.annotation);
  const geometry = hitGeomOf(record, view);
  const stroke = { ...style, strokeWidth: hitStrokeOf(record, view) };
  if (measure?.intent === 'line-dimension') {
    const distance = distanceLayout(geometry, measure, stroke.strokeWidth);
    if (distance) return distancePainted(distance, stroke.strokeWidth);
  }
  const caption = measure ? measurementLayout(geometry, measure, stroke)?.caption : null;
  const shape = geomPainted(geometry, stroke, isFilled(record));
  return caption ? [...captionPainted(caption), ...shape] : shape;
}

/**
 * Is `point` on a text box's own box, where its text is? Not on a callout's
 * line, and not in the empty rest of its frame. `margin` reaches the resize
 * handles on its border. The box is tested where the page shows it, as a
 * click tests it.
 */
export function isOnTextBox(
  record: ModelAnnotation,
  point: Point,
  margin: number,
  view?: ViewEnv,
): boolean {
  const geometry = hitGeomOf(record, view);
  return geometry.kind === 'text-box' && isInTurnedBox(geometry, point, margin);
}

/** Stroke width in effective content units (a noZoom body's line weight scales
 *  with its geometry). */
const hitStrokeOf = (record: ModelAnnotation, view: ViewEnv | undefined): number =>
  anchoredStrokeWidth(styleOf(record.annotation).strokeWidth, anchorModeOf(record), view);

// `opaqueBody` kinds (stamp images, note icons) are visible across their whole box, so they
// hit like a filled shape. Not keyed on `source: 'baked'` — every annotation
// loaded from a PDF starts baked, and an unfilled square must still be grabbed
// only on its outline.
const isFilled = (record: ModelAnnotation): boolean => {
  const geometry = shapeOf(record.annotation);
  const style = styleOf(record.annotation);
  return (
    style.interiorColor != null ||
    geometry.kind === 'quads' ||
    kindOf(record.annotation).caps.opaqueBody
  );
};
const inRect = (rect: Rect, point: Point): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;
// Is the point inside the annotation's selection frame: the oriented quad the chrome
// outlines, tilt included (a rotated box across its tilted body; a thin arrow's or a
// callout's whole outline box, empty corners and all)?
const inFrame = (record: ModelAnnotation, point: Point, view: ViewEnv | undefined): boolean =>
  pointInQuad(point, annotationSelectionFrame(record, view).corners);

/**
 * The union of the selection bounds of every selected, movable annotation on a
 * page — the same box `chrome` outlines for a multi-selection. Null unless 2+
 * such annotations are selected here. This is the grab region for the gaps
 * between grouped/multi-selected annotations, so dragging the whole selection
 * works from anywhere inside its visible outline (not only on a member).
 */
function selectionUnionBounds(model: Model, page: PageRef, view: ViewEnv | undefined): Rect | null {
  const pageObjectNumber = page.objectNumber;
  const selection = model.selected.filter(
    (id) =>
      model.byId[id]?.annotation.page.objectNumber === pageObjectNumber &&
      isSelectable(model, id) &&
      canMove(model, id),
  );
  if (selection.length < 2) return null;
  const corners: Point[] = [];
  for (const id of selection) {
    const record = model.byId[id];
    corners.push(...annotationSelectionFrame(record, view).corners);
  }
  return unionRect(corners);
}

/** The axis-aligned union of the selection bounds of every selected annotation on
 *  a page (no movable/lock filter) — the box group chrome + group rotate use. */
export function groupUnionBounds(model: Model, page: PageRef, view?: ViewEnv): Rect | null {
  const pageObjectNumber = page.objectNumber;
  const corners: Point[] = [];
  for (const id of model.selected) {
    const record = model.byId[id];
    if (!record || record.annotation.page.objectNumber !== pageObjectNumber) continue;
    corners.push(...annotationSelectionFrame(record, view).corners);
  }
  return corners.length ? unionRect(corners) : null;
}

/**
 * What's under the page point.
 *  1. a resize/vertex handle of the single selection,
 *  2. an editable annotation body — a selected one anywhere in its bounds (so you
 *     can drag to move it), an unselected one only on its stroke/fill (margin-aware,
 *     so an unfilled circle is grabbed only on its outline),
 *  3. else empty.
 */
export function hitTest(
  model: Model,
  page: PageRef,
  point: Point,
  chromeGeometry: ChromeGeometry,
  strokeMargin: number,
  pageBox?: Rect,
  inert?: ReadonlySet<Id>,
  view?: ViewEnv,
): Target {
  const pageObjectNumber = page.objectNumber;
  if (model.selected.length === 1 && isSelectable(model, model.selected[0])) {
    const record = model.byId[model.selected[0]];
    if (record.annotation.page.objectNumber === pageObjectNumber) {
      // The rotate knob (checked first — it floats outside the box, clear of
      // the handles), placed on the projected selection frame so it sits exactly
      // where the chrome drew it — a screen-anchored body rotates too (the
      // gesture edits its authored tilt; `noRotate` only exempts it from the
      // page's rotation). Locked suppresses it. `placeRotateKnob` keeps it
      // inside `pageBox`.
      if (kindOf(record.annotation).caps.rotatable && annotTransformable(record)) {
        const frame = annotationSelectionFrame(record, view);
        const knob = placeRotateKnob(frame.corners, chromeGeometry.knobOffset, pageBox);
        if (
          chromeGeometry.rotationHandle !== false &&
          Math.abs(knob.at.x - point.x) <= chromeGeometry.knobTol &&
          Math.abs(knob.at.y - point.y) <= chromeGeometry.knobTol
        ) {
          return {
            kind: 'rotate',
            ids: [record.id],
            pivot: annotationTurnPivot(record, view),
          };
        }
      }
      if (hasHandles(model, record)) {
        const style = styleOf(record.annotation);
        const measure = measurementOf(record.annotation);
        const geometry = hitGeomOf(record, view);
        const distance =
          measure?.intent === 'line-dimension' &&
          distanceLayout(geometry, measure, hitStrokeOf(record, view));
        const handles = distance ? distanceHandles(distance) : geomHandles(geometry);
        if (distance) {
          // Nearby endpoint and leader hit areas overlap at small offsets.
          // The closest visible handle wins, regardless of declaration order.
          const distanceToPointer = (handle: (typeof handles)[number]) =>
            Math.hypot(handle.at.x - point.x, handle.at.y - point.y);
          handles.sort((left, right) => distanceToPointer(left) - distanceToPointer(right));
        }

        // The text is the drag target. It owns no visible handle, and wins
        // before the annotation's sticky body bounds.
        const layout =
          measure &&
          measurementLayout(geometry, measure, {
            ...style,
            strokeWidth: hitStrokeOf(record, view),
          });
        if (
          layout &&
          distanceCaptionHit(layout, point, Math.min(2, chromeGeometry.handleTol / 3))
        ) {
          return { kind: 'handle', id: record.id, handle: 'caption', cursor: 'move' };
        }
        // Handles live on the projected geometry — the handle gesture then
        // runs entirely in view space (see the `handle` draft).
        for (const handle of handles) {
          if (
            Math.abs(handle.at.x - point.x) <= chromeGeometry.handleTol &&
            Math.abs(handle.at.y - point.y) <= chromeGeometry.handleTol
          ) {
            return {
              kind: 'handle',
              id: record.id,
              handle: handle.id,
              cursor: cursorOnScreen(handle.cursor, view?.rotation ?? 0),
            };
          }
        }
      }
    }
  } else if (model.selected.length > 1) {
    // Multi-target group: a rotate knob hanging off the union box, gated by the
    // group caps (every member rotatable + none locked). Screen-anchored
    // members rotate WYSIWYG like everyone else (their authored tilt turns).
    const gc = groupCaps(model, model.selected);
    if (gc.rotatable) {
      const union = groupUnionBounds(model, page, view);
      if (union) {
        const corners: [Point, Point, Point, Point] = [
          { x: union.x, y: union.y },
          { x: union.x + union.width, y: union.y },
          { x: union.x + union.width, y: union.y + union.height },
          { x: union.x, y: union.y + union.height },
        ];
        const knob = placeRotateKnob(corners, chromeGeometry.knobOffset, pageBox);
        if (
          chromeGeometry.rotationHandle !== false &&
          Math.abs(knob.at.x - point.x) <= chromeGeometry.knobTol &&
          Math.abs(knob.at.y - point.y) <= chromeGeometry.knobTol
        ) {
          const pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
          return {
            kind: 'rotate',
            ids: model.selected.filter(
              (id) => model.byId[id]?.annotation.page.objectNumber === pageObjectNumber,
            ),
            pivot,
          };
        }
      }
    }
    if (gc.resizable) {
      const union = groupUnionBounds(model, page, view);
      if (union) {
        for (const handle of rectHandlesFor(union)) {
          if (
            Math.abs(handle.at.x - point.x) <= chromeGeometry.handleTol &&
            Math.abs(handle.at.y - point.y) <= chromeGeometry.handleTol
          ) {
            return {
              kind: 'group-handle',
              ids: model.selected.filter(
                (id) => model.byId[id]?.annotation.page.objectNumber === pageObjectNumber,
              ),
              handle: handle.id,
              cursor: cursorOnScreen(handle.cursor, view?.rotation ?? 0),
              box: union,
            };
          }
        }
      }
    }
  }
  const order = paintOrder(model, page);
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const record = model.byId[id];
    // `inert` ids (engaged Behaviors — form widgets under a fill tool) are
    // invisible here: their own DOM owns the pointer.
    if (!record || inert?.has(id) || !isSelectable(model, id)) continue;
    // A selected annotation that can move is grabbed anywhere in its frame as
    // well as on what it paints, so selecting never shrinks where it is grabbed;
    // any other is grabbed only on its stroke or fill (so a selectable but
    // text-bound kind still re-selects cleanly).
    if (model.selected.includes(id) && canMove(model, id) && inFrame(record, point, view)) {
      return { kind: 'annot', id };
    }
    if (paintedNear(paintedOf(record, view), point, strokeMargin)) {
      return { kind: 'annot', id };
    }
  }
  // Nothing under the point directly — but a multi-selection is grabbable across
  // its whole union box (the gaps between members included), so a drag there moves
  // the group as a unit instead of clearing it. Resolve to the top-most selected
  // member so `editDown` keeps the selection and arms the move.
  const union = selectionUnionBounds(model, page, view);
  if (union && inRect(union, point)) {
    for (let i = order.length - 1; i >= 0; i--) {
      if (model.selected.includes(order[i]) && canMove(model, order[i]))
        return { kind: 'annot', id: order[i] };
    }
  }
  return { kind: 'empty' };
}

/** The cursor to show on hover: a resize cursor over a handle, move/pointer over a body. */
export function cursorAt(
  model: Model,
  page: PageRef,
  point: Point,
  geometry: ChromeGeometry,
  strokeMargin: number,
  pageBox?: Rect,
  inert?: ReadonlySet<Id>,
  view?: ViewEnv,
): Cursor | null {
  const target = hitTest(model, page, point, geometry, strokeMargin, pageBox, inert, view);
  if (target.kind === 'handle') return target.cursor;
  if (target.kind === 'group-handle') return target.cursor;
  if (target.kind === 'rotate') return 'grab';
  if (target.kind === 'annot')
    return model.selected.includes(target.id) && canMove(model, target.id) ? 'move' : 'pointer';
  return null;
}
