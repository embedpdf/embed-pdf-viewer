import {
  geomHandles,
  geomHit,
  obbFromGeom,
  placeRotateKnob,
  pointInQuad,
  rectHandlesFor,
  selectionCenter,
  selectionQuad,
  unionRect,
} from './geometry';
import { capsFor, isMarkup } from './kinds';
import { groupCaps } from './group';
import { isSubstrateOnly } from './plane';
import { annotInteractive, annotTransformable, viewable } from './flags';
import { anchoredGeom, anchoredStrokeWidth, anchorModeOf, type ViewEnv } from './anchor';
import {
  type Annot,
  type ChromeGeom,
  type Cursor,
  type Geom,
  type Id,
  type Model,
  type Rect,
  type Vec,
} from './types';

export type Target =
  | { t: 'handle'; id: Id; handle: string; cursor: Cursor }
  // The rotate knob of the current selection (single shape or multi-target
  // group). `pivot` is the rotation centre the gesture turns about.
  | { t: 'rotate'; ids: Id[]; pivot: Vec }
  // A resize handle of the multi-target group box (the union box of the
  // selection). `box` is that union box; `ids` the members it scales.
  | { t: 'group-handle'; ids: Id[]; handle: string; cursor: Cursor; box: Rect }
  | { t: 'annot'; id: Id }
  | { t: 'empty' };

/** Page annotation ids in PAINT order (back→front): text-layer markups first
 *  (always beneath), then every other kind, each group preserving creation
 *  z-order. The ONE z-order shared by rendering (`pageItems`) and hit-testing —
 *  and the ONE visibility cull: what `/F` hides (hidden / un-engaged noView)
 *  neither paints nor hits, so an invisible annotation can never eat a click.
 *  Conversation-plane annotations (replies, review-status states) are culled
 *  here too — dialogue lives in the comments UI, never on the page. */
export function paintOrder(m: Model, pon: number): Id[] {
  const markup: Id[] = [];
  const other: Id[] = [];
  for (const id of m.order) {
    const a = m.byId[id];
    if (!a || a.pon !== pon) continue;
    if (!viewable(a.flags, m.selected.includes(id))) continue;
    if (isSubstrateOnly(a)) continue;
    (isMarkup(a.subtype) ? markup : other).push(id);
  }
  return [...markup, ...other];
}

/** Can this annotation be clicked to select? (`/F` interaction flags override
 *  all caps — hidden/noView/readOnly are inert; LOCKED stays selectable, it
 *  just won't transform.) */
export const isSelectable = (m: Model, id: Id): boolean => {
  const a = m.byId[id];
  return !!a && annotInteractive(a) && capsFor(a.subtype).selectable;
};

/** An anchored kind's QUAD geometry is bound to underlying text — never moved
 *  or resized. This is what lets one caps set serve both redaction shapes:
 *  area marks (rect geometry) keep their transforms, text marks (quads) are
 *  as fixed as classic markup. Markup kinds themselves have `movable: false`
 *  and never reach this gate. */
const textBound = (a: Annot): boolean => capsFor(a.subtype).anchored && a.geom.t === 'quads';

/** Can this annotation be dragged by its body to move? (`locked` freezes it.) */
export const canMove = (m: Model, id: Id): boolean => {
  const a = m.byId[id];
  return !!a && annotTransformable(a) && capsFor(a.subtype).movable && !textBound(a);
};

/** Does this kind expose drag handles (box resize OR per-vertex)? Only
 *  `locked` (and inert `/F` states) suppress them at runtime — a
 *  screen-anchored body keeps its handles: `noZoom`/`noRotate` exempt it from
 *  the display transform, they don't freeze its size or vertices. */
const hasHandles = (m: Model, a: Annot): boolean => {
  if (!annotTransformable(a) || textBound(a)) return false;
  const c = capsFor(a.subtype);
  return c.resizable || c.vertexEditable;
};

/** The geometry a pointer actually meets: the anchored (screen-constant)
 *  projection for `noZoom`/`noRotate` annotations, the stored geom otherwise.
 *  The SAME projection `pageItems` renders, so click matches paint. */
const hitGeomOf = (a: Annot, view: ViewEnv | undefined): Geom =>
  anchoredGeom(a.geom, anchorModeOf(a), view);

/** Stroke width in EFFECTIVE content units (a noZoom body's line weight scales
 *  with its geometry). */
const hitStrokeOf = (a: Annot, view: ViewEnv | undefined): number =>
  anchoredStrokeWidth(a.style.strokeWidth, anchorModeOf(a), view);

// `opaqueBody` kinds (stamp images) are visible across their whole box, so they
// hit like a filled shape. NOT keyed on `source: 'baked'` — every annotation
// loaded from a PDF starts baked, and an unfilled square must still be grabbed
// only on its outline.
const isFilled = (a: Annot): boolean =>
  a.style.interiorColor != null || a.geom.t === 'quads' || capsFor(a.subtype).opaqueBody;
const inRect = (b: Rect, p: Vec): boolean =>
  p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
// A SELECTED annotation is grabbable from anywhere inside its SELECTION region — the
// SAME oriented quad the chrome outlines — so the grab area matches what you see
// highlighted, tilt included (a rotated box is grabbable across its tilted body, not
// just its unrotated footprint; a thin arrow's whole outline box, arrowhead and all).
const inBounds = (a: Annot, p: Vec, view: ViewEnv | undefined): boolean =>
  pointInQuad(p, selectionQuad(hitGeomOf(a, view), hitStrokeOf(a, view), a.style.border));

/**
 * The union of the SELECTION bounds of every selected, movable annotation on a
 * page — the SAME box `chrome` outlines for a multi-selection. Null unless 2+
 * such annotations are selected here. This is the grab region for the gaps
 * BETWEEN grouped/multi-selected annotations, so dragging the whole selection
 * works from anywhere inside its visible outline (not only on a member).
 */
function selectionUnionBounds(m: Model, pon: number, view: ViewEnv | undefined): Rect | null {
  const sel = m.selected.filter(
    (id) => m.byId[id]?.pon === pon && isSelectable(m, id) && canMove(m, id),
  );
  if (sel.length < 2) return null;
  const corners: Vec[] = [];
  for (const id of sel) {
    const a = m.byId[id];
    corners.push(...selectionQuad(hitGeomOf(a, view), hitStrokeOf(a, view), a.style.border));
  }
  return unionRect(corners);
}

/** The axis-aligned union of the SELECTION bounds of every selected annotation on
 *  a page (no movable/lock filter) — the box group chrome + group rotate use. */
export function groupUnionBounds(m: Model, pon: number, view?: ViewEnv): Rect | null {
  const corners: Vec[] = [];
  for (const id of m.selected) {
    const a = m.byId[id];
    if (!a || a.pon !== pon) continue;
    corners.push(...selectionQuad(hitGeomOf(a, view), hitStrokeOf(a, view), a.style.border));
  }
  return corners.length ? unionRect(corners) : null;
}

/**
 * What's under the content point.
 *  1. a resize/vertex handle of the single selection,
 *  2. an editable annotation body — a SELECTED one anywhere in its bounds (so you
 *     can drag to move it), an UNSELECTED one only on its stroke/fill (margin-aware,
 *     so an unfilled circle is grabbed only on its outline),
 *  3. else empty.
 */
export function hitTest(
  m: Model,
  pon: number,
  p: Vec,
  geom: ChromeGeom,
  strokeMargin: number,
  pageBox?: Rect,
  inert?: ReadonlySet<Id>,
  view?: ViewEnv,
): Target {
  if (m.selected.length === 1 && isSelectable(m, m.selected[0])) {
    const a = m.byId[m.selected[0]];
    if (a.pon === pon) {
      // The rotate knob (checked first — it floats outside the box, clear of
      // the handles), placed on the PROJECTED geometry so it sits exactly
      // where the chrome drew it — a screen-anchored body rotates too (the
      // gesture edits its authored tilt; `noRotate` only exempts it from the
      // PAGE's rotation). Locked suppresses it. `placeRotateKnob` keeps it
      // inside `pageBox`.
      if (capsFor(a.subtype).rotatable && annotTransformable(a)) {
        const hg = hitGeomOf(a, view);
        const obb = obbFromGeom(hg, hitStrokeOf(a, view), a.style.border);
        if (obb) {
          const knob = placeRotateKnob(obb.corners, geom.knobOffset, pageBox);
          if (
            Math.abs(knob.at.x - p.x) <= geom.knobTol &&
            Math.abs(knob.at.y - p.y) <= geom.knobTol
          ) {
            return {
              t: 'rotate',
              ids: [a.id],
              // VIEW-space pivot: the projected shape's centre — the point the
              // user sees the shape turn about (the commit conjugates back).
              pivot: selectionCenter(hg, hitStrokeOf(a, view)),
            };
          }
        }
      }
      if (hasHandles(m, a)) {
        // Handles live on the PROJECTED geometry — the handle gesture then
        // runs entirely in view space (see the `handle` draft).
        for (const h of geomHandles(hitGeomOf(a, view))) {
          if (
            Math.abs(h.at.x - p.x) <= geom.handleTol &&
            Math.abs(h.at.y - p.y) <= geom.handleTol
          ) {
            return { t: 'handle', id: a.id, handle: h.id, cursor: h.cursor };
          }
        }
      }
    }
  } else if (m.selected.length > 1) {
    // Multi-target group: a rotate knob hanging off the union box, gated by the
    // group caps (every member rotatable + none locked). Screen-anchored
    // members rotate WYSIWYG like everyone else (their authored tilt turns).
    const gc = groupCaps(m, m.selected);
    if (gc.rotatable) {
      const union = groupUnionBounds(m, pon, view);
      if (union) {
        const corners: [Vec, Vec, Vec, Vec] = [
          { x: union.x, y: union.y },
          { x: union.x + union.width, y: union.y },
          { x: union.x + union.width, y: union.y + union.height },
          { x: union.x, y: union.y + union.height },
        ];
        const knob = placeRotateKnob(corners, geom.knobOffset, pageBox);
        if (
          Math.abs(knob.at.x - p.x) <= geom.knobTol &&
          Math.abs(knob.at.y - p.y) <= geom.knobTol
        ) {
          const pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
          return { t: 'rotate', ids: m.selected.filter((id) => m.byId[id]?.pon === pon), pivot };
        }
      }
    }
    if (gc.resizable) {
      const union = groupUnionBounds(m, pon, view);
      if (union) {
        for (const h of rectHandlesFor(union)) {
          if (
            Math.abs(h.at.x - p.x) <= geom.handleTol &&
            Math.abs(h.at.y - p.y) <= geom.handleTol
          ) {
            return {
              t: 'group-handle',
              ids: m.selected.filter((id) => m.byId[id]?.pon === pon),
              handle: h.id,
              cursor: h.cursor,
              box: union,
            };
          }
        }
      }
    }
  }
  const order = paintOrder(m, pon);
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const a = m.byId[id];
    // `inert` ids (engaged Behaviors — form widgets under a fill tool) are
    // invisible here: their own DOM owns the pointer.
    if (!a || inert?.has(id) || !isSelectable(m, id)) continue;
    // A SELECTED annotation is sticky-grabbable from anywhere in its bounds, but
    // only if it can actually move; otherwise it's grabbed on its stroke/fill like
    // an unselected one (so a selectable-but-anchored kind still re-selects cleanly).
    const hit =
      m.selected.includes(id) && canMove(m, id)
        ? inBounds(a, p, view)
        : geomHit(hitGeomOf(a, view), p, strokeMargin, isFilled(a), hitStrokeOf(a, view));
    if (hit) return { t: 'annot', id };
  }
  // Nothing under the point directly — but a multi-selection is grabbable across
  // its WHOLE union box (the gaps between members included), so a drag there moves
  // the group as a unit instead of clearing it. Resolve to the top-most selected
  // member so `editDown` keeps the selection and arms the move.
  const union = selectionUnionBounds(m, pon, view);
  if (union && inRect(union, p)) {
    for (let i = order.length - 1; i >= 0; i--) {
      if (m.selected.includes(order[i]) && canMove(m, order[i]))
        return { t: 'annot', id: order[i] };
    }
  }
  return { t: 'empty' };
}

/** The cursor to show on hover: a resize cursor over a handle, move/pointer over a body. */
export function cursorAt(
  m: Model,
  pon: number,
  p: Vec,
  geom: ChromeGeom,
  strokeMargin: number,
  pageBox?: Rect,
  inert?: ReadonlySet<Id>,
  view?: ViewEnv,
): Cursor | null {
  const t = hitTest(m, pon, p, geom, strokeMargin, pageBox, inert, view);
  if (t.t === 'handle') return t.cursor;
  if (t.t === 'group-handle') return t.cursor;
  if (t.t === 'rotate') return 'grab';
  if (t.t === 'annot') return m.selected.includes(t.id) && canMove(m, t.id) ? 'move' : 'pointer';
  return null;
}
