/**
 * Anchored overlays — one primitive for every piece of UI that floats over
 * page content (selection menus, draft menus, future popovers).
 *
 * The factoring:
 *   - plugins produce anchors (a page-space rect on a page, plus points
 *     to dodge) as capability reads.
 *   - The projection snapshot contract and the placement math are shared,
 *     framework-neutral, in `@embedpdf/web` ({@link ViewProjector},
 *     `projectAnchoredTarget`).
 *   - surfaces (<Stage>, <PageView>) provide a {@link ProjectorBinding}:
 *     the snapshot plus react's way of knowing when it changed.
 *   - <Anchored> renders at the projected position, flips to the other
 *     side and stays inside the view once it knows its size (unless
 *     pinned), isolates pointer events, and portals when the space demands
 *     it. On a page that isn't shown it renders nothing and doesn't follow
 *     the camera at all (see {@link ShownPages}).
 *
 * The scheduling law (this is what keeps menus glued to the content): a
 * state-driven projection change (the Stage camera) reaches consumers as a
 * new binding identity through context — surface and overlay re-render in
 * the same React commit, so they can never paint a frame apart. No
 * listener sets, no post-commit notifications, no second menu-only render.
 * `subscribe` exists only for genuinely browser-driven invalidation (a
 * PageView moving because the document scrolled), where no state change
 * announces the move.
 */
import * as React from 'react';
import { createContext, useContext, useEffect, useLayoutEffect, useReducer, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  projectAnchoredTarget,
  type AnchoredFit,
  type AnchoredPlacement,
  type AnchoredRect,
  type AnchorTarget,
  type ViewProjector,
} from '@embedpdf/web';

export type {
  AnchoredPlacement,
  AnchoredSide,
  AnchorTarget,
  PageViewEnv,
  ViewProjector,
} from '@embedpdf/web';

/**
 * What a page surface provides via context: the pure projection snapshot,
 * bound to React's reactivity.
 */
export interface ProjectorBinding {
  projector: ViewProjector;
  /**
   * Changes identity exactly when projection may have changed for
   * state-driven reasons — the Stage uses its `visiblePages()` value (a
   * stable reference that already folds camera, viewport, scene and DPR).
   * Consumers re-render because the binding's identity changes with it;
   * nothing reads this field, but it is what makes the memoized binding
   * change, so do not "optimize" it away.
   */
  revision: unknown;
  /** Browser-driven invalidation only (PageView scroll/resize — see
   *  `observeClientGeometry`). The Stage deliberately provides none. */
  subscribe?: (callback: () => void) => () => void;
}

const ProjectorContext = createContext<ProjectorBinding | null>(null);

/** Installed by page surfaces (<Stage>, <PageView>) — not by app code. */
export const ProjectorProvider = ProjectorContext.Provider;

/**
 * The pages a surface shows right now, by object number. It is a value of its
 * own, next to the projection, because it changes only when a page comes on
 * screen or leaves it: anchored UI on other pages reads only this, so it
 * isn't rendered again on every camera frame.
 */
export type ShownPages = ReadonlySet<number>;

const ShownPagesContext = createContext<ShownPages | null>(null);

/** Installed by page surfaces (<Stage>, <PageView>) — not by app code. */
export const ShownPagesProvider = ShownPagesContext.Provider;

/** The surface's projector binding, or null outside any page surface — for
 *  chrome that degrades (and warns) instead of throwing. */
export function useOptionalProjectorBinding(): ProjectorBinding | null {
  return useContext(ProjectorContext);
}

/** The surface's projector binding. Reading it subscribes the caller to
 *  projection changes (the binding's identity is the revision). */
export function useProjectorBinding(): ProjectorBinding {
  const binding = useContext(ProjectorContext);
  if (!binding) {
    throw new Error(
      'No ViewProjector in scope: mount anchored UI under <Stage> (overlay slot) or <PageView>.',
    );
  }
  return binding;
}

export interface AnchoredProps {
  /**
   * The box on a page to sit next to, in page coordinates: `{ page, bounds }`,
   * with `avoid` points to keep clear of. `null`, or a target without
   * `bounds` (a search match with no geometry), hides it.
   */
  anchor: (Omit<AnchorTarget, 'bounds'> & { bounds?: AnchoredRect }) | null;
  /**
   * Where to sit: a side of the box, centred, or lined up with the side's
   * start or end (`'top-end'`). Default 'top'.
   */
  placement?: AnchoredPlacement;
  /**
   * Gap in screen px between the box and the content, and between the content
   * and the view's edge. Negative overlaps the box. Default 8.
   */
  gap?: number;
  /**
   * Stay where `placement` puts it: never flip to the other side, never move
   * to stay in view, and scroll away with the box. For badges and status;
   * menus leave it off. Default false.
   */
  pinned?: boolean;
  children: React.ReactNode;
}

/** The area anchored UI stays inside: the surface's own box (overlay space) or the window (client space). */
function viewOf(element: HTMLElement, space: ViewProjector['space']): AnchoredRect | null {
  if (space === 'client') {
    const { clientWidth, clientHeight } = element.ownerDocument.documentElement;
    return { x: 0, y: 0, width: clientWidth, height: clientHeight };
  }
  const container = element.offsetParent;
  return container
    ? { x: 0, y: 0, width: container.clientWidth, height: container.clientHeight }
    : null;
}

const sameFit = (left: AnchoredFit | null, right: AnchoredFit): boolean =>
  left !== null &&
  left.size.width === right.size.width &&
  left.size.height === right.size.height &&
  left.view.width === right.view.width &&
  left.view.height === right.view.height;

/**
 * Position `children` around a page-space anchor, on whichever page surface
 * is in scope. Projection runs during render from the shared pure helper.
 * Once the content's size is measured, it flips to the opposite side when
 * the chosen one has no room, and stays inside the view, unless `pinned`.
 * Pointer isolation keeps a click inside anchored UI from reaching the
 * surface's own listener (which would read it as a click outside).
 *
 * Anchored UI on a page that isn't shown renders nothing and reads only the
 * pages on screen, so a document with hundreds of badges costs only the ones
 * in view while people scroll and zoom.
 */
export function Anchored(props: AnchoredProps) {
  const shown = useContext(ShownPagesContext);
  if (!props.anchor?.bounds) return null;
  if (shown && !shown.has(props.anchor.page.objectNumber)) return null;
  return <PlacedAnchored {...props} />;
}

/** Anchored UI on a page that is shown: it follows the camera. */
function PlacedAnchored({
  anchor,
  placement = 'top',
  gap = 8,
  pinned = false,
  children,
}: AnchoredProps) {
  const { projector, subscribe } = useProjectorBinding();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  // The content's size and the view's: measured after the first commit, and
  // again whenever either resizes. A camera move changes neither.
  const [fit, setFit] = useState<AnchoredFit | null>(null);

  // Browser-driven invalidation only (PageView). State-driven changes come
  // through the binding identity — no local bump involved.
  const [, force] = useReducer((x: number) => x + 1, 0);
  useLayoutEffect(() => (subscribe ? subscribe(force) : undefined), [subscribe]);
  // Client-space surfaces measure the DOM, which does not exist during the
  // surface's first render — force one post-commit pass so the position
  // appears as soon as it is measurable. (Solves measurability, not
  // reactivity.)
  useLayoutEffect(() => {
    if (projector.space === 'client') force();
  }, [projector, anchor]);

  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => {
      const view = viewOf(element, projector.space);
      if (!view) return;
      const next = { size: { width: element.offsetWidth, height: element.offsetHeight }, view };
      setFit((current) => (sameFit(current, next) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (projector.space === 'overlay' && element.offsetParent)
      observer.observe(element.offsetParent);
    else window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [element, projector.space]);

  useEffect(() => {
    if (!element) return;
    const stop = (event: Event) => event.stopPropagation();
    element.addEventListener('pointerdown', stop);
    return () => element.removeEventListener('pointerdown', stop);
  }, [element]);

  if (!anchor?.bounds) return null;
  const pos = projectAnchoredTarget(
    projector,
    { ...anchor, bounds: anchor.bounds },
    { placement, gap, pinned },
    fit,
  );
  if (!pos) return null;

  const node = (
    <div
      ref={setElement}
      style={{
        position: projector.space === 'client' ? 'fixed' : 'absolute',
        left: pos.left,
        top: pos.top,
        // Its own width, wherever it sits: the size the placement measured.
        width: 'max-content',
        transform: pos.transform,
        pointerEvents: 'auto',
      }}
    >
      {children}
    </div>
  );
  if (projector.space === 'client') {
    if (typeof document === 'undefined') return null;
    return createPortal(node, document.body);
  }
  return node;
}
