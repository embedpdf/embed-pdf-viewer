import type { PageRef } from '@embedpdf/engine-core/runtime';
import { annotationSelectionFrame } from './selection';
import { distanceCaptionHit, distanceHandles, distanceHit, distanceLayout } from './measurement';
import { measurementLayout } from './measurement-shape';
import {
  geomHandles,
  geomHit,
  placeRotateKnob,
  pointInQuad,
  rectHandlesFor,
  unionRect,
} from './geometry';
import { capsFor, isMarkup } from './kinds';
import { groupCaps } from './group';
import { isSubstrateOnly } from './plane';
import { annotInteractive, annotTransformable, viewable } from './flags';
import { anchoredGeom, anchoredStrokeWidth, anchorModeOf, type ViewEnv } from './anchor';
import {
  type ModelAnnotation,
  type ChromeGeometry,
  type Cursor,
  type ContentGeometry,
  type Id,
  type Model,
  type Rect,
  type Point,
} from './types';

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
  const pageObjectNumber = page.pageObjectNumber;
  const markup: Id[] = [];
  const other: Id[] = [];
  for (const id of model.order) {
    const annotation = model.byId[id];
    if (!annotation || annotation.page.pageObjectNumber !== pageObjectNumber) continue;
    if (!viewable(annotation.flags, model.selected.includes(id))) continue;
    if (isSubstrateOnly(annotation)) continue;
    (isMarkup(annotation.subtype) ? markup : other).push(id);
  }
  return [...markup, ...other];
}

/** Can this annotation be clicked to select? (`/F` interaction flags override
 *  all caps — hidden/noView/readOnly are inert; locked stays selectable, it
 *  just won't transform.) */
export const isSelectable = (model: Model, id: Id): boolean => {
  const annotation = model.byId[id];
  return !!annotation && annotInteractive(annotation) && capsFor(annotation.subtype).selectable;
};

/** An anchored kind's quad geometry is bound to underlying text — never moved
 *  or resized. This is what lets one caps set serve both redaction shapes:
 *  area marks (rect geometry) keep their transforms, text marks (quads) are
 *  as fixed as classic markup. Markup kinds themselves have `movable: false`
 *  and never reach this gate. */
const textBound = (annotation: ModelAnnotation): boolean =>
  capsFor(annotation.subtype).anchored && annotation.geometry.kind === 'quads';

/** Can this annotation be dragged by its body to move? (`locked` freezes it.) */
export const canMove = (model: Model, id: Id): boolean => {
  const annotation = model.byId[id];
  return (
    !!annotation &&
    annotTransformable(annotation) &&
    capsFor(annotation.subtype).movable &&
    !textBound(annotation)
  );
};

/** Does this kind expose drag handles (box resize or per-vertex)? Only
 *  `locked` (and inert `/F` states) suppress them at runtime — a
 *  screen-anchored body keeps its handles: `noZoom`/`noRotate` exempt it from
 *  the display transform, they don't freeze its size or vertices. */
const hasHandles = (model: Model, annotation: ModelAnnotation): boolean => {
  if (!annotTransformable(annotation) || textBound(annotation)) return false;
  const caps = capsFor(annotation.subtype);
  return caps.resizable || caps.vertexEditable;
};

/** The geometry a pointer actually meets: the anchored (screen-constant)
 *  projection for `noZoom`/`noRotate` annotations, the stored geom otherwise.
 *  The same projection `pageItems` renders, so click matches paint. */
const hitGeomOf = (annotation: ModelAnnotation, view: ViewEnv | undefined): ContentGeometry =>
  anchoredGeom(annotation.geometry, anchorModeOf(annotation), view);

/** Stroke width in effective content units (a noZoom body's line weight scales
 *  with its geometry). */
const hitStrokeOf = (annotation: ModelAnnotation, view: ViewEnv | undefined): number =>
  anchoredStrokeWidth(annotation.style.strokeWidth, anchorModeOf(annotation), view);

// `opaqueBody` kinds (stamp images) are visible across their whole box, so they
// hit like a filled shape. Not keyed on `source: 'baked'` — every annotation
// loaded from a PDF starts baked, and an unfilled square must still be grabbed
// only on its outline.
const isFilled = (annotation: ModelAnnotation): boolean =>
  annotation.style.interiorColor != null ||
  annotation.geometry.kind === 'quads' ||
  capsFor(annotation.subtype).opaqueBody;
const inRect = (rect: Rect, point: Point): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;
// A selected annotation is grabbable from anywhere inside its selection region — the
// Same oriented quad the chrome outlines — so the grab area matches what you see
// highlighted, tilt included (a rotated box is grabbable across its tilted body, not
// just its unrotated footprint; a thin arrow's whole outline box, arrowhead and all).
const inBounds = (annotation: ModelAnnotation, point: Point, view: ViewEnv | undefined): boolean =>
  pointInQuad(point, annotationSelectionFrame(annotation, view).corners);

/**
 * The union of the selection bounds of every selected, movable annotation on a
 * page — the same box `chrome` outlines for a multi-selection. Null unless 2+
 * such annotations are selected here. This is the grab region for the gaps
 * between grouped/multi-selected annotations, so dragging the whole selection
 * works from anywhere inside its visible outline (not only on a member).
 */
function selectionUnionBounds(model: Model, page: PageRef, view: ViewEnv | undefined): Rect | null {
  const pageObjectNumber = page.pageObjectNumber;
  const selection = model.selected.filter(
    (id) =>
      model.byId[id]?.page.pageObjectNumber === pageObjectNumber &&
      isSelectable(model, id) &&
      canMove(model, id),
  );
  if (selection.length < 2) return null;
  const corners: Point[] = [];
  for (const id of selection) {
    const annotation = model.byId[id];
    corners.push(...annotationSelectionFrame(annotation, view).corners);
  }
  return unionRect(corners);
}

/** The axis-aligned union of the selection bounds of every selected annotation on
 *  a page (no movable/lock filter) — the box group chrome + group rotate use. */
export function groupUnionBounds(model: Model, page: PageRef, view?: ViewEnv): Rect | null {
  const pageObjectNumber = page.pageObjectNumber;
  const corners: Point[] = [];
  for (const id of model.selected) {
    const annotation = model.byId[id];
    if (!annotation || annotation.page.pageObjectNumber !== pageObjectNumber) continue;
    corners.push(...annotationSelectionFrame(annotation, view).corners);
  }
  return corners.length ? unionRect(corners) : null;
}

/**
 * What's under the content point.
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
  const pageObjectNumber = page.pageObjectNumber;
  if (model.selected.length === 1 && isSelectable(model, model.selected[0])) {
    const annotation = model.byId[model.selected[0]];
    if (annotation.page.pageObjectNumber === pageObjectNumber) {
      // The rotate knob (checked first — it floats outside the box, clear of
      // the handles), placed on the projected selection frame so it sits exactly
      // where the chrome drew it — a screen-anchored body rotates too (the
      // gesture edits its authored tilt; `noRotate` only exempts it from the
      // page's rotation). Locked suppresses it. `placeRotateKnob` keeps it
      // inside `pageBox`.
      if (capsFor(annotation.subtype).rotatable && annotTransformable(annotation)) {
        const frame = annotationSelectionFrame(annotation, view);
        const knob = placeRotateKnob(frame.corners, chromeGeometry.knobOffset, pageBox);
        if (
          Math.abs(knob.at.x - point.x) <= chromeGeometry.knobTol &&
          Math.abs(knob.at.y - point.y) <= chromeGeometry.knobTol
        ) {
          return { kind: 'rotate', ids: [annotation.id], pivot: frame.center };
        }
      }
      if (hasHandles(model, annotation)) {
        const geometry = hitGeomOf(annotation, view);
        const distance =
          annotation.measure?.intent === 'LineDimension' &&
          distanceLayout(geometry, annotation.measure, hitStrokeOf(annotation, view));
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
          annotation.measure &&
          measurementLayout(geometry, annotation.measure, {
            ...annotation.style,
            strokeWidth: hitStrokeOf(annotation, view),
          });
        if (
          layout &&
          distanceCaptionHit(layout, point, Math.min(2, chromeGeometry.handleTol / 3))
        ) {
          return { kind: 'handle', id: annotation.id, handle: 'caption', cursor: 'move' };
        }
        // Handles live on the projected geometry — the handle gesture then
        // runs entirely in view space (see the `handle` draft).
        for (const handle of handles) {
          if (
            Math.abs(handle.at.x - point.x) <= chromeGeometry.handleTol &&
            Math.abs(handle.at.y - point.y) <= chromeGeometry.handleTol
          ) {
            return { kind: 'handle', id: annotation.id, handle: handle.id, cursor: handle.cursor };
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
          Math.abs(knob.at.x - point.x) <= chromeGeometry.knobTol &&
          Math.abs(knob.at.y - point.y) <= chromeGeometry.knobTol
        ) {
          const pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
          return {
            kind: 'rotate',
            ids: model.selected.filter(
              (id) => model.byId[id]?.page.pageObjectNumber === pageObjectNumber,
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
                (id) => model.byId[id]?.page.pageObjectNumber === pageObjectNumber,
              ),
              handle: handle.id,
              cursor: handle.cursor,
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
    const annotation = model.byId[id];
    // `inert` ids (engaged Behaviors — form widgets under a fill tool) are
    // invisible here: their own DOM owns the pointer.
    if (!annotation || inert?.has(id) || !isSelectable(model, id)) continue;
    // A selected annotation is sticky-grabbable from anywhere in its bounds, but
    // only if it can actually move; otherwise it's grabbed on its stroke/fill like
    // an unselected one (so a selectable-but-anchored kind still re-selects cleanly).
    const geometry = hitGeomOf(annotation, view);
    const strokeWidth = hitStrokeOf(annotation, view);
    const distance =
      annotation.measure?.intent === 'LineDimension' &&
      distanceLayout(geometry, annotation.measure, strokeWidth);
    const layout =
      annotation.measure &&
      measurementLayout(geometry, annotation.measure, { ...annotation.style, strokeWidth });
    const hit =
      (layout && distanceCaptionHit(layout, point, strokeMargin)) ||
      (model.selected.includes(id) && canMove(model, id)
        ? inBounds(annotation, point, view)
        : distance
          ? distanceHit(distance, point, strokeWidth, strokeMargin)
          : geomHit(geometry, point, strokeMargin, isFilled(annotation), strokeWidth));

    if (hit) {
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
