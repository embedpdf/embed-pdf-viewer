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

export type AnchoredPlacement = 'top' | 'right' | 'bottom' | 'left';

/** CSS-ready output: absolute/fixed `left`/`top` plus a centering transform. */
export interface AnchoredPosition {
  left: number;
  top: number;
  transform: string;
  /** The side of the box it sits on: the one asked for, or the opposite one when that had no room. */
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

/** What anchored UI attaches to: a page-space rect on a page, plus
 *  optional page-space points the UI must clear (e.g. a rotate knob).
 *  Structural — plugin anchor reads satisfy it without importing this
 *  package. */
export interface AnchorTarget {
  page: PageRef;
  bounds: AnchoredRect;
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
  viewEnv(page: PageRef): {
    scale: number;
    rotation: 0 | 90 | 180 | 270;
    zoom: number;
  } | null;
}

/**
 * The anchored projection: anchor → screen position, in one pure call —
 * projection, avoid-point transform, and the shared placement policy.
 * Frameworks recompute this inside their native reactive primitive
 * (a React render, a Vue `computed`, an Angular signal, a Svelte
 * `$derived`); nothing here schedules anything.
 */
export function projectAnchoredTarget(
  projector: ViewProjector,
  anchor: AnchorTarget,
  placement: AnchoredPlacement,
  gap: number,
  fit?: AnchoredFit | null,
): AnchoredPosition | null {
  const box = projector.toScreen(anchor.page, anchor.bounds);
  if (!box) return null;
  const avoid = anchor.avoid?.length ? projector.toScreenPoint(anchor.page, anchor.avoid[0]) : null;
  return fit
    ? fitAnchoredRect(box, placement, gap, fit, avoid)
    : positionAnchoredRect(box, placement, gap, avoid);
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

/**
 * Place an upright element around `box` (screen px). `avoid` is a screen
 * point the element must clear (e.g. the rotate knob): the element extends
 * only the edge it sits on, and only when the point protrudes past that
 * edge — so it clears the obstacle without ever shifting off-centre on the
 * other axis. When the point is on another side (e.g. a 90° shape, knob at
 * mid-height for a `top` placement) the edge is untouched and the element
 * stays centred on `box`.
 */
export function positionAnchoredRect(
  box: AnchoredRect,
  placement: AnchoredPlacement,
  gap: number,
  avoid?: AnchoredPoint | null,
): AnchoredPosition {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  switch (placement) {
    case 'bottom': {
      const edge = Math.max(box.y + box.height, avoid ? avoid.y : -Infinity);
      return { left: cx, top: edge + gap, transform: 'translate(-50%, 0)', placement };
    }
    case 'left': {
      const edge = Math.min(box.x, avoid ? avoid.x : Infinity);
      return { left: edge - gap, top: cy, transform: 'translate(-100%, -50%)', placement };
    }
    case 'right': {
      const edge = Math.max(box.x + box.width, avoid ? avoid.x : -Infinity);
      return { left: edge + gap, top: cy, transform: 'translate(0, -50%)', placement };
    }
    case 'top':
    default: {
      const edge = Math.min(box.y, avoid ? avoid.y : Infinity);
      return { left: cx, top: edge - gap, transform: 'translate(-50%, -100%)', placement: 'top' };
    }
  }
}

const OPPOSITE: Readonly<Record<AnchoredPlacement, AnchoredPlacement>> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/**
 * Place an element of a known size around `box`, inside `fit.view`. It sits
 * on the side `placement` names when it fits there; otherwise on the opposite
 * side when that fits, or has more room. Then, while `box` is in view, it
 * moves along both axes to stay inside the view, `gap` from its edges; UI
 * whose box scrolled out of view goes with it. The result is the element's
 * top-left corner, with no transform.
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
  const cornerOn = (side: AnchoredPlacement): AnchoredPoint => {
    const { left, top } = positionAnchoredRect(box, side, gap, avoid);
    if (side === 'top') return { x: left - size.width / 2, y: top - size.height };
    if (side === 'bottom') return { x: left - size.width / 2, y: top };
    if (side === 'left') return { x: left - size.width, y: top - size.height / 2 };
    return { x: left, y: top - size.height / 2 };
  };
  const fits = (side: AnchoredPlacement, corner: AnchoredPoint): boolean => {
    if (side === 'top') return corner.y >= inner.top;
    if (side === 'bottom') return corner.y + size.height <= inner.bottom;
    if (side === 'left') return corner.x >= inner.left;
    return corner.x + size.width <= inner.right;
  };
  /** The space between the box and the view's edge on a side. */
  const roomOn = (side: AnchoredPlacement): number => {
    if (side === 'top') return box.y - view.y;
    if (side === 'bottom') return view.y + view.height - (box.y + box.height);
    if (side === 'left') return box.x - view.x;
    return view.x + view.width - (box.x + box.width);
  };

  let side = placement;
  let corner = cornerOn(side);
  if (!fits(side, corner)) {
    const other = OPPOSITE[side];
    const otherCorner = cornerOn(other);
    if (fits(other, otherCorner) || roomOn(other) > roomOn(side)) {
      side = other;
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
  return { left: corner.x, top: corner.y, transform: 'none', placement: side };
}
