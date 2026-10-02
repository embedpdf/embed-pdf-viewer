/**
 * Selection handles — the pure policy half.
 *
 * A handle is the boundary glyph's leading (or trailing) edge: a segment
 * between two corners of the glyph's oriented cell, with the grab head just
 * beyond the ascent at the start / past the baseline at the end. Bar length,
 * angle, and head all derive from that one segment, so rotated text and
 * rotated pages are carried by construction — the AABB never enters.
 *
 * Everything here is DOM-free and framework-free: geometry is pure given a
 * projector, and the drag session speaks the selection's own gesture verbs
 * (`beginGestureAt`/`extendTo`/`endGesture` — the same ones the pointer handler uses; a
 * handle drag is a selection gesture, re-anchored). The framework adapters
 * keep only subscriptions and markup; the DOM listener mechanics live in
 * `@embedpdf/web`'s `attachSelectionHandle`.
 *
 * The view dependency is structural (`selectionHandleViewOf` builds it from
 * anything shaped like `StageCapability`) so this plugin stays stage-free —
 * selection also runs in stage-less hosts (`PageView`) — and the math tests
 * run against a fake.
 */
import { quadEdge } from '@embedpdf/core-geometry';
import type { Point, Quad } from '@embedpdf/core-geometry';
import type { PageRef } from '@embedpdf/engine-core/runtime';
import type { SelectionSnapshot } from './contract';

/** What handle geometry & drags need from the hosting view. */
export interface SelectionHandleView {
  /** Page page point → overlay px. Must be point-exact (compose
   *  `pageToWorld` with `toScreen`); an AABB projector loses orientation. */
  toOverlay(page: PageRef, point: Point): Point | null;
  /** Overlay px → the page under it, or null over a gap. */
  pageAt(overlay: Point): { ref: PageRef; point: Point } | null;
  /** Overlay px → a specific page's page space, unclamped. */
  pointOnPage(page: PageRef, overlay: Point): Point | null;
}

/** The Stage's projection, as the handles use it: `StageCapability` satisfies it. */
export interface SelectionHandleStage {
  pageToViewport(page: PageRef, point: Point): Point | null;
  getPageAt(point: Point): { ref: PageRef; point: Point } | null;
  viewportToPage(page: PageRef, point: Point): Point | null;
}

/**
 * The handles' view over a Stage: point-exact projection in, page lookup out.
 * (The Stage's box projector, `pageRectToViewport`, is for upright overlays
 * and would lose the orientation a handle needs.)
 */
export function selectionHandleViewOf(stage: SelectionHandleStage): SelectionHandleView {
  return {
    toOverlay: (page, point) => stage.pageToViewport(page, point),
    pageAt: (overlay) => stage.getPageAt(overlay),
    pointOnPage: (page, overlay) => stage.viewportToPage(page, overlay),
  };
}

/** One selection boundary, as the handle needs it (a `SelectionEndpoint` slice). */
export interface SelectionHandleEndpoint {
  page: PageRef;
  /** The boundary glyph's own oriented cell, page page space. */
  glyphQuad: Quad;
  /** Reading direction of its segment (+1 = the frame's +x) — decides which
   *  side of the cell is the selection's leading edge. */
  advance: 1 | -1;
}

/** Both ends of a selection, as the handles need them. */
export interface SelectionHandleEndpoints {
  start: SelectionHandleEndpoint;
  end: SelectionHandleEndpoint;
}

/**
 * The two ends of the selection in `snapshot` (`getSnapshot()`), or null
 * while nothing is selected. A new object on every call: compare with
 * `sameSelectionEndpoints` from `@embedpdf/web`.
 */
export function selectionHandleEndpointsOf(
  snapshot: Pick<SelectionSnapshot, 'start' | 'end'>,
): SelectionHandleEndpoints | null {
  const { start, end } = snapshot;
  if (!start || !end) return null;
  return {
    start: { page: start.page, glyphQuad: start.glyphQuad, advance: start.advance },
    end: { page: end.page, glyphQuad: end.glyphQuad, advance: end.advance },
  };
}

/** The gesture verbs a handle drag drives — `SelectionHostCapability` satisfies it. */
export interface SelectionHandleTarget {
  beginGestureAt(page: PageRef, point: Point): boolean;
  extendTo(page: PageRef, point: Point): void;
  endGesture(): void;
}

// The iOS caret-handle design, one source for every adapter: a thin bar that
// is the selection's edge, capped by a screen-constant circle; pad is the
// invisible finger padding around the visual.
export const HANDLE_HEAD = 12; // px — the circle
export const HANDLE_BAR = 2; // px — the caret bar
export const HANDLE_PAD = 14; // px — grab padding

/** Tilts within ~0.05° of upright render untransformed (float-noise guard —
 *  and the dominant case stays pixel-identical to an axis-aligned box). */
const HANDLE_ROT_EPSILON = 0.05;

export interface SelectionHandleGeom {
  /** The projected edge, ascent corner first, overlay px. */
  bar: { from: Point; to: Point };
  /** The glyph's ink height on screen — zoom scaling comes free. */
  length: number;
  /** Degrees clockwise; 0 when the text is upright on screen. */
  rotation: number;
  /** True within the epsilon of upright: render with no transform. */
  upright: boolean;
  /** Centre of the grab head, overlay px. */
  head: Point;
}

const midpoint = (from: Point, to: Point): Point => ({
  x: (from.x + to.x) / 2,
  y: (from.y + to.y) / 2,
});

/**
 * The handle's geometry for one endpoint, in overlay space. Null when the
 * endpoint's page isn't laid out (or the cell is degenerate) — render nothing.
 */
export function selectionHandleGeom(
  view: SelectionHandleView,
  endpoint: SelectionHandleEndpoint,
  role: 'start' | 'end',
): SelectionHandleGeom | null {
  // Which side of the cell is this selection's edge is a reading-order
  // question (`advance`), never a geometric one.
  const leading = role === 'start' ? endpoint.advance > 0 : endpoint.advance < 0;
  const [upperPage, lowerPage] = quadEdge(endpoint.glyphQuad, leading ? 'left' : 'right');
  const upper = view.toOverlay(endpoint.page, upperPage);
  const lower = view.toOverlay(endpoint.page, lowerPage);
  if (!upper || !lower) return null;
  const dx = lower.x - upper.x;
  const dy = lower.y - upper.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  // 0° when the text is upright: the bar runs straight down the screen.
  const rotation = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
  const upright = Math.abs(rotation) < HANDLE_ROT_EPSILON;
  const ux = dx / length;
  const uy = dy / length;
  const head =
    role === 'start'
      ? { x: upper.x - (ux * HANDLE_HEAD) / 2, y: upper.y - (uy * HANDLE_HEAD) / 2 }
      : { x: lower.x + (ux * HANDLE_HEAD) / 2, y: lower.y + (uy * HANDLE_HEAD) / 2 };
  return { bar: { from: upper, to: lower }, length, rotation, upright, head };
}

export interface SelectionHandleDragSession {
  /** Feed the pointer's current overlay position. */
  move(overlay: Point): void;
  /** The pointer released (or was cancelled): settle the gesture. */
  end(): void;
}

/**
 * One armed handle drag. Dragging a handle extends from the opposite
 * endpoint: the first movement re-roots the selection gesture at that
 * endpoint's cell centre, and every position then extends toward the pointer
 * — snapping to glyphs and crossing pages exactly like a pointer drag,
 * firing the same change/commit signals. Over a gap the point projects onto
 * the last page hit (unclamped), so the selection keeps tracking instead of
 * freezing at a page edge. `end()` commits only if the drag actually
 * re-rooted; an untouched press settles nothing.
 */
export function createSelectionHandleDrag(
  selection: SelectionHandleTarget,
  view: SelectionHandleView,
  opposite: SelectionHandleEndpoint,
  draggedPage: PageRef,
): SelectionHandleDragSession {
  // The fixed anchor: the opposite endpoint's cell centre — orientation-free
  // (a parallelogram's diagonal midpoints coincide), so it lands inside the
  // glyph for rotated text too.
  const quad = opposite.glyphQuad;
  const anchorPoint = midpoint(
    midpoint(quad.upperLeft, quad.lowerRight),
    midpoint(quad.upperRight, quad.lowerLeft),
  );
  let begun = false;
  let lastPage = draggedPage;
  return {
    move: (overlay) => {
      if (!begun) {
        if (!selection.beginGestureAt(opposite.page, anchorPoint)) return;
        begun = true;
      }
      const hit = view.pageAt(overlay);
      if (hit) {
        lastPage = hit.ref;
        selection.extendTo(hit.ref, hit.point);
      } else {
        const point = view.pointOnPage(lastPage, overlay);
        if (point) selection.extendTo(lastPage, point);
      }
    },
    end: () => {
      if (begun) selection.endGesture(); // settle → menu reappears, onCommitted fires
    },
  };
}

/** A press on a handle, armed: the point it grabbed and the drag it starts. */
export interface ArmedSelectionHandle {
  /** The point the user grabbed: the bar's midpoint, overlay px. */
  base: Point;
  drag: SelectionHandleDragSession;
}

/**
 * Arm a drag of the `role` handle at a press, with the view and the endpoints
 * as they are at that moment: it extends the selection from the opposite end.
 * Null when the handle's page isn't laid out.
 */
export function armSelectionHandle(
  selection: SelectionHandleTarget,
  view: SelectionHandleView,
  endpoints: SelectionHandleEndpoints,
  role: 'start' | 'end',
): ArmedSelectionHandle | null {
  const geometry = selectionHandleGeom(view, endpoints[role], role);
  if (!geometry) return null;
  const opposite = endpoints[role === 'start' ? 'end' : 'start'];
  return {
    base: midpoint(geometry.bar.from, geometry.bar.to),
    drag: createSelectionHandleDrag(selection, view, opposite, endpoints[role].page),
  };
}
