/**
 * Anchored-overlay geometry for UI floating over page content (selection
 * menus, draft menus, popovers): the projector snapshot contract, the
 * anchor shape, and the placement math. Pure values and pure functions over
 * structural rect/point shapes — no EmbedPDF types, no framework, no
 * reactive lifecycle — so every framework adapter (React, Vue, Svelte,
 * Angular) shares one implementation and binds it with its native
 * reactivity (context revision, signals, computed, $derived).
 *
 * The boundary laws:
 *   - Placement policy lives here, above the projector seam: a projector
 *     only knows geometry — never what is being positioned nor where it
 *     prefers to sit.
 *   - A projector describes the current projection; it never implements a
 *     framework-style reactive lifecycle. State-driven changes (the Stage
 *     camera) must reach consumers through the framework's own render
 *     cycle so surface and overlay commit together; only genuinely
 *     browser-driven changes (a PageView moving because the document
 *     scrolled) use an external listener ({@link observeClientGeometry}).
 */

import type { PageRef } from './page-ref';

export interface AnchoredRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnchoredPoint {
  x: number;
  y: number;
}

/** A side of the box. */
export type AnchoredSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * Where anchored UI sits: a side of the box, centred on it, or lined up with
 * the side's start or end (`'top-end'`: above the box, right edges lined up).
 */
export type AnchoredPlacement = AnchoredSide | `${AnchoredSide}-${'start' | 'end'}`;

/** How anchored UI is placed: where, how far from the box, and whether it may move to fit. */
export interface AnchoredOptions {
  placement: AnchoredPlacement;
  /** Screen px between the box and the UI; negative overlaps the box. */
  gap: number;
  /** Stays where `placement` puts it: never flips, never moves to stay in view. */
  pinned?: boolean;
}

/** CSS-ready output: absolute/fixed `left`/`top` plus a centering transform. */
export interface AnchoredPosition {
  left: number;
  top: number;
  transform: string;
  /** Where it sits: the placement asked for, or its opposite side when that had no room. */
  placement: AnchoredPlacement;
}

export interface AnchoredSize {
  width: number;
  height: number;
}

/**
 * What placement needs to keep anchored UI on screen: the element's size, and
 * the area it must stay inside, in the projector's space (the Stage's own box,
 * or the browser window).
 */
export interface AnchoredFit {
  size: AnchoredSize;
  view: AnchoredRect;
}

/** How a page is shown right now: its view scale, its rotation on screen, and its zoom (1 = 100%). */
export interface PageViewEnv {
  scale: number;
  rotation: 0 | 90 | 180 | 270;
  zoom: number;
}

/** What anchored UI attaches to: a page-space rect on a page, plus
 *  optional page-space points the UI must clear (e.g. a rotate knob).
 *  Structural — plugin anchor reads satisfy it without importing this
 *  package. */
export interface AnchorTarget {
  page: PageRef;
  bounds: AnchoredRect;
  /**
   * Where the box is in a given view, for a box whose size or orientation
   * depends on it (a note that keeps its size on screen). The projection
   * calls it, so the anchor itself never has to follow the view.
   */
  boundsIn?: (view: PageViewEnv) => AnchoredRect | null;
  avoid?: AnchoredPoint[];
}

/**
 * A page surface's projection snapshot: how a page-space rect on a page
 * becomes screen coordinates, right now. Provided by `<Stage>`
 * (camera-driven, pure state, no DOM reads) and `<PageView>` (DOM-measured).
 * Deliberately no subscribe here — when projection changes is a framework
 * binding concern (see the module doc), not part of the snapshot.
 */
export interface ViewProjector {
  /**
   * Which coordinate space `toScreen` speaks, and therefore how anchored
   * content mounts:
   *   - 'overlay': coords are relative to the surface's own positioned
   *     container → rendered in place, position:absolute. (Stage)
   *   - 'client': coords are viewport px → portalled to the document body,
   *     position:fixed, so no ancestor overflow can clip. (PageView)
   */
  space: 'overlay' | 'client';
  /** Page-space rect on a page → coords in `space`. Null: not projectable
   *  right now (page not shown / not measurable yet). */
  toScreen(page: PageRef, rect: AnchoredRect): AnchoredRect | null;
  toScreenPoint(page: PageRef, at: AnchoredPoint): AnchoredPoint | null;
  /** The page's live view facts (for anchor reads that need them — e.g. the
   *  screen-constant rotate-knob stalk), or null when the page isn't shown. */
  viewEnv(page: PageRef): PageViewEnv | null;
  /** The area anchored UI can be seen in, in `space`: the surface's box, or
   *  the window. Null while it isn't measurable yet. */
  view(): AnchoredRect | null;
}

/**
 * The anchored projection: anchor → screen position, in one pure call —
 * projection, avoid-point transform, and the shared placement policy.
 * Frameworks recompute this inside their native reactive primitive
 * (a React render, a Vue `computed`, an Angular signal, a Svelte
 * `$derived`); nothing here schedules anything.
 *
 * Null when there is nothing to show: the page isn't shown, or the box is so
 * far out of view that the UI around it can't reach into it.
 */
export function projectAnchoredTarget(
  projector: ViewProjector,
  anchor: AnchorTarget,
  { placement, gap, pinned = false }: AnchoredOptions,
  fit?: AnchoredFit | null,
): AnchoredPosition | null {
  const env = anchor.boundsIn ? projector.viewEnv(anchor.page) : null;
  const bounds = env && anchor.boundsIn ? anchor.boundsIn(env) : anchor.bounds;
  if (!bounds) return null;
  const box = projector.toScreen(anchor.page, bounds);
  if (!box) return null;
  const view = projector.view();
  // Until its size is measured, assume the UI reaches no further than the gap.
  const reach = Math.abs(gap) + (fit ? Math.max(fit.size.width, fit.size.height) : 0);
  if (view && !overlaps(box, view, reach)) return null;
  const avoid = anchor.avoid?.length ? projector.toScreenPoint(anchor.page, anchor.avoid[0]) : null;
  return fit && !pinned
    ? fitAnchoredRect(box, placement, gap, fit, avoid)
    : positionAnchoredRect(box, placement, gap, avoid);
}

/** Whether `box`, grown by `margin` on every side, touches `view`. */
function overlaps(box: AnchoredRect, view: AnchoredRect, margin: number): boolean {
  return (
    box.x - margin < view.x + view.width &&
    box.x + box.width + margin > view.x &&
    box.y - margin < view.y + view.height &&
    box.y + box.height + margin > view.y
  );
}

/**
 * The one genuinely browser-driven invalidation: an element in normal
 * document flow moves when the document scrolls or the window resizes —
 * no state change announces it. `<PageView>`'s binding registers this;
 * the Stage never does (its camera is state, delivered through render).
 */
export function observeClientGeometry(callback: () => void): () => void {
  window.addEventListener('scroll', callback, true);
  window.addEventListener('resize', callback);
  return () => {
    window.removeEventListener('scroll', callback, true);
    window.removeEventListener('resize', callback);
  };
}

/** A placement's side and how it lines up along that side. */
function splitPlacement(placement: AnchoredPlacement): {
  side: AnchoredSide;
  align: 'start' | 'center' | 'end';
} {
  const [side, align] = placement.split('-') as [AnchoredSide, 'start' | 'end' | undefined];
  return { side, align: align ?? 'center' };
}

/**
 * The point an element is placed at, and how far its own size shifts it from
 * there (`0` keeps its left or top edge on the point, `1` its right or bottom
 * edge, `0.5` its middle).
 */
interface Placed {
  x: number;
  y: number;
  shiftX: number;
  shiftY: number;
}

function placeAround(
  box: AnchoredRect,
  placement: AnchoredPlacement,
  gap: number,
  avoid?: AnchoredPoint | null,
): Placed {
  const { side, align } = splitPlacement(placement);
  // Along the side: the box's start edge, middle or end edge.
  const along = (start: number, length: number) =>
    align === 'start' ? start : align === 'end' ? start + length : start + length / 2;
  const alongShift = align === 'start' ? 0 : align === 'end' ? 1 : 0.5;
  switch (side) {
    case 'bottom': {
      const edge = Math.max(box.y + box.height, avoid ? avoid.y : -Infinity);
      return { x: along(box.x, box.width), y: edge + gap, shiftX: alongShift, shiftY: 0 };
    }
    case 'left': {
      const edge = Math.min(box.x, avoid ? avoid.x : Infinity);
      return { x: edge - gap, y: along(box.y, box.height), shiftX: 1, shiftY: alongShift };
    }
    case 'right': {
      const edge = Math.max(box.x + box.width, avoid ? avoid.x : -Infinity);
      return { x: edge + gap, y: along(box.y, box.height), shiftX: 0, shiftY: alongShift };
    }
    case 'top':
    default: {
      const edge = Math.min(box.y, avoid ? avoid.y : Infinity);
      return { x: along(box.x, box.width), y: edge - gap, shiftX: alongShift, shiftY: 1 };
    }
  }
}

const shiftCss = (shift: number): string => (shift === 0 ? '0' : `${-shift * 100}%`);

/**
 * Place an upright element around `box` (screen px). `avoid` is a screen
 * point the element must clear (e.g. the rotate knob): the element extends
 * only the edge it sits on, and only when the point protrudes past that
 * edge — so it clears the obstacle without ever shifting along the side.
 * When the point is on another side (e.g. a 90° shape, knob at mid-height
 * for a `top` placement) the edge is untouched.
 */
export function positionAnchoredRect(
  box: AnchoredRect,
  placement: AnchoredPlacement,
  gap: number,
  avoid?: AnchoredPoint | null,
): AnchoredPosition {
  const placed = placeAround(box, placement, gap, avoid);
  return {
    left: placed.x,
    top: placed.y,
    transform: `translate(${shiftCss(placed.shiftX)}, ${shiftCss(placed.shiftY)})`,
    placement,
  };
}

const OPPOSITE: Readonly<Record<AnchoredSide, AnchoredSide>> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/** The same placement on the other side of the box: `'top-end'` becomes `'bottom-end'`. */
const opposite = (placement: AnchoredPlacement): AnchoredPlacement => {
  const { side, align } = splitPlacement(placement);
  const flipped = OPPOSITE[side];
  return align === 'center' ? flipped : `${flipped}-${align}`;
};

/**
 * Place an element of a known size around `box`, inside `fit.view`. It sits
 * where `placement` says when it fits there; otherwise on the opposite side,
 * lined up the same way, when that fits or has more room. Then, while `box`
 * is in view, it moves along both axes to stay inside the view, `gap` from
 * its edges; UI whose box scrolled out of view goes with it. The result is
 * the element's top-left corner, with no transform.
 */
export function fitAnchoredRect(
  box: AnchoredRect,
  placement: AnchoredPlacement,
  gap: number,
  fit: AnchoredFit,
  avoid?: AnchoredPoint | null,
): AnchoredPosition {
  const { size, view } = fit;
  const inner = {
    left: view.x + gap,
    top: view.y + gap,
    right: view.x + view.width - gap,
    bottom: view.y + view.height - gap,
  };
  const cornerOn = (at: AnchoredPlacement): AnchoredPoint => {
    const placed = placeAround(box, at, gap, avoid);
    return { x: placed.x - placed.shiftX * size.width, y: placed.y - placed.shiftY * size.height };
  };
  const fits = (at: AnchoredPlacement, corner: AnchoredPoint): boolean => {
    const { side } = splitPlacement(at);
    if (side === 'top') return corner.y >= inner.top;
    if (side === 'bottom') return corner.y + size.height <= inner.bottom;
    if (side === 'left') return corner.x >= inner.left;
    return corner.x + size.width <= inner.right;
  };
  /** The space between the box and the view's edge on a placement's side. */
  const roomOn = (at: AnchoredPlacement): number => {
    const { side } = splitPlacement(at);
    if (side === 'top') return box.y - view.y;
    if (side === 'bottom') return view.y + view.height - (box.y + box.height);
    if (side === 'left') return box.x - view.x;
    return view.x + view.width - (box.x + box.width);
  };

  let chosen = placement;
  let corner = cornerOn(chosen);
  if (!fits(chosen, corner)) {
    const other = opposite(chosen);
    const otherCorner = cornerOn(other);
    if (fits(other, otherCorner) || roomOn(other) > roomOn(chosen)) {
      chosen = other;
      corner = otherCorner;
    }
  }

  const boxInView =
    box.x < view.x + view.width &&
    box.x + box.width > view.x &&
    box.y < view.y + view.height &&
    box.y + box.height > view.y;
  if (boxInView) {
    // Larger than the view: its top-left edge stays in view.
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
    corner = {
      x: clamp(corner.x, inner.left, inner.right - size.width),
      y: clamp(corner.y, inner.top, inner.bottom - size.height),
    };
  }
  return { left: corner.x, top: corner.y, transform: 'none', placement: chosen };
}
