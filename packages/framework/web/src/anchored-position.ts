/**
 * Anchored-overlay geometry for UI floating over page content (selection
 * menus, draft menus, popovers): the projector SNAPSHOT contract, the
 * anchor shape, and the placement math. Pure values and pure functions over
 * structural rect/point shapes — no EmbedPDF types, no framework, no
 * reactive lifecycle — so every framework adapter (React, Vue, Svelte,
 * Angular) shares ONE implementation and binds it with its NATIVE
 * reactivity (context revision, signals, computed, $derived).
 *
 * The boundary laws:
 *   - Placement policy lives HERE, above the projector seam: a projector
 *     only knows geometry — never what is being positioned nor where it
 *     prefers to sit.
 *   - A projector describes the CURRENT projection; it never implements a
 *     framework-style reactive lifecycle. State-driven changes (the Stage
 *     camera) must reach consumers through the framework's own render
 *     cycle so surface and overlay commit TOGETHER; only genuinely
 *     browser-driven changes (a PageView moving because the document
 *     scrolled) use an external listener ({@link observeClientGeometry}).
 */

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
}

/**
 * Place an upright element around `box` (screen px). `avoid` is a screen
 * point the element must clear (e.g. the rotate knob): the element extends
 * ONLY the edge it sits on, and ONLY when the point protrudes past that
 * edge — so it clears the obstacle without ever shifting off-centre on the
 * other axis. When the point is on another side (e.g. a 90° shape, knob at
 * mid-height for a `top` placement) the edge is untouched and the element
 * stays centred on `box`.
 */
/** What anchored UI attaches to: a content-space rect on a page, plus
 *  optional content-space points the UI must clear (e.g. a rotate knob).
 *  Structural — plugin anchor reads satisfy it without importing this
 *  package. */
export interface AnchorTarget {
  pon: number;
  bounds: AnchoredRect;
  avoid?: AnchoredPoint[];
}

/**
 * A page surface's PROJECTION SNAPSHOT: how a content-space rect on a page
 * becomes screen coordinates, right now. Provided by `<Stage>`
 * (camera-driven, pure state, no DOM reads) and `<PageView>` (DOM-measured).
 * Deliberately NO subscribe here — when projection changes is a framework
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
  /** Content-space rect on a page → coords in `space`. Null: not projectable
   *  right now (page not shown / not measurable yet). */
  toScreen(pon: number, rect: AnchoredRect): AnchoredRect | null;
  toScreenPoint(pon: number, at: AnchoredPoint): AnchoredPoint | null;
  /** The page's live view facts (for anchor reads that need them — e.g. the
   *  screen-constant rotate-knob stalk), or null when the page isn't shown. */
  viewEnv(pon: number): {
    scale: number;
    rotation: 0 | 90 | 180 | 270;
    zoom: number;
  } | null;
}

/**
 * THE anchored projection: anchor → screen position, in one pure call —
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
): AnchoredPosition | null {
  const box = projector.toScreen(anchor.pon, anchor.bounds);
  if (!box) return null;
  const avoid = anchor.avoid?.length
    ? projector.toScreenPoint(anchor.pon, anchor.avoid[0])
    : null;
  return positionAnchoredRect(box, placement, gap, avoid);
}

/**
 * The one genuinely BROWSER-driven invalidation: an element in normal
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
      return { left: cx, top: edge + gap, transform: 'translate(-50%, 0)' };
    }
    case 'left': {
      const edge = Math.min(box.x, avoid ? avoid.x : Infinity);
      return { left: edge - gap, top: cy, transform: 'translate(-100%, -50%)' };
    }
    case 'right': {
      const edge = Math.max(box.x + box.width, avoid ? avoid.x : -Infinity);
      return { left: edge + gap, top: cy, transform: 'translate(0, -50%)' };
    }
    case 'top':
    default: {
      const edge = Math.min(box.y, avoid ? avoid.y : Infinity);
      return { left: cx, top: edge - gap, transform: 'translate(-50%, -100%)' };
    }
  }
}
