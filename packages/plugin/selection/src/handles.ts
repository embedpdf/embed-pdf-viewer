/**
 * Selection handles — the pure policy half (the `wheel.ts` convention).
 *
 * A handle IS the boundary glyph's leading (or trailing) edge: a segment
 * between two corners of the glyph's ORIENTED cell, with the grab head just
 * beyond the ascent at the start / past the baseline at the end. Bar length,
 * angle, and head all derive from that one segment, so rotated text and
 * rotated pages are carried by construction — the AABB never enters.
 *
 * Everything here is DOM-free and framework-free: geometry is pure given a
 * projector, and the drag session speaks the selection's own gesture verbs
 * (`beginAt`/`extendTo`/`end` — the same ones the pointer handler uses; a
 * handle drag IS a selection gesture, re-anchored). The framework adapters
 * keep only subscriptions and markup; the DOM listener mechanics live in
 * `@embedpdf/web`'s `attachSelectionHandle`.
 *
 * The view dependency is STRUCTURAL (satisfied by five lines over
 * `StageCapability`) so this plugin stays stage-free — selection also runs
 * in stage-less hosts (`PageView`) — and the math tests run against a fake.
 */
import { textQuadEdge } from '@embedpdf/core-geometry';
import type { Point, TextQuad } from '@embedpdf/core-geometry';
import type { PageObjectNumber } from '@embedpdf/core';

/** What handle geometry & drags need from the hosting view. */
export interface SelectionHandleView {
  /** Page content point → overlay px. Must be POINT-exact (compose
   *  `pageToWorld` with `toScreen`); an AABB projector loses orientation. */
  toOverlay(pon: PageObjectNumber, pt: Point): Point | null;
  /** Overlay px → the page under it, or null over a gap. */
  pageAt(overlay: Point): { pon: PageObjectNumber; point: Point } | null;
  /** Overlay px → a SPECIFIC page's content space, unclamped. */
  pointOnPage(pon: PageObjectNumber, overlay: Point): Point | null;
}

/** One selection boundary, as the handle needs it (a `SelectionEndpoint` slice). */
export interface SelectionHandleEndpoint {
  pon: PageObjectNumber;
  /** The boundary glyph's own oriented cell, page content space. */
  glyphQuad: TextQuad;
  /** Reading direction of its segment (+1 = the frame's +x) — decides which
   *  side of the cell is the selection's leading edge. */
  advance: 1 | -1;
}

/** The gesture verbs a handle drag drives — `SelectionHostCapability` satisfies it. */
export interface SelectionHandleTarget {
  beginAt(pon: PageObjectNumber, point: Point): boolean;
  extendTo(pon: PageObjectNumber, point: Point): void;
  end(): void;
}

// The iOS caret-handle design, one source for every adapter: a thin BAR that
// is the selection's edge, capped by a screen-constant circle; PAD is the
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
  /** True within the epsilon of upright: render with NO transform. */
  upright: boolean;
  /** Centre of the grab head, overlay px. */
  head: Point;
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * The handle's geometry for one endpoint, in overlay space. Null when the
 * endpoint's page isn't laid out (or the cell is degenerate) — render nothing.
 */
export function selectionHandleGeom(
  view: SelectionHandleView,
  ep: SelectionHandleEndpoint,
  role: 'start' | 'end',
): SelectionHandleGeom | null {
  // Which SIDE of the cell is this selection's edge is a reading-order
  // question (`advance`), never a geometric one.
  const leading = role === 'start' ? ep.advance > 0 : ep.advance < 0;
  const [upperPage, lowerPage] = textQuadEdge(ep.glyphQuad, leading ? 'start' : 'end');
  const upper = view.toOverlay(ep.pon, upperPage);
  const lower = view.toOverlay(ep.pon, lowerPage);
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
 * One armed handle drag. Dragging a handle extends from the OPPOSITE
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
  draggedPon: PageObjectNumber,
): SelectionHandleDragSession {
  // The fixed anchor: the opposite endpoint's cell CENTRE — orientation-free
  // (a parallelogram's diagonal midpoints coincide), so it lands inside the
  // glyph for rotated text too.
  const q = opposite.glyphQuad;
  const anchorPoint = midpoint(midpoint(q.upperStart, q.lowerEnd), midpoint(q.upperEnd, q.lowerStart));
  let begun = false;
  let lastPon = draggedPon;
  return {
    move: (overlay) => {
      if (!begun) {
        if (!selection.beginAt(opposite.pon, anchorPoint)) return;
        begun = true;
      }
      const hit = view.pageAt(overlay);
      if (hit) {
        lastPon = hit.pon;
        selection.extendTo(hit.pon, hit.point);
      } else {
        const p = view.pointOnPage(lastPon, overlay);
        if (p) selection.extendTo(lastPon, p);
      }
    },
    end: () => {
      if (begun) selection.end(); // settle → menu reappears, onCommit fires
    },
  };
}
