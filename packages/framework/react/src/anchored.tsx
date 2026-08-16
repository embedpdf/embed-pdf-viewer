/**
 * Anchored overlays — ONE primitive for every piece of UI that floats over
 * page content (selection menus, draft menus, future popovers).
 *
 * The factoring:
 *   - PLUGINS produce anchors (a content-space rect on a page, plus points
 *     to dodge) as capability reads.
 *   - The projection SNAPSHOT contract and the placement math are shared,
 *     framework-neutral, in `@embedpdf/web` ({@link ViewProjector},
 *     `projectAnchoredTarget`).
 *   - SURFACES (<Stage>, <PageView>) provide a {@link ProjectorBinding}:
 *     the snapshot plus REACT's way of knowing when it changed.
 *   - <Anchored> renders at the projected position, isolates pointer
 *     events, and portals when the space demands it.
 *
 * THE SCHEDULING LAW (this is what keeps menus glued to the content): a
 * state-driven projection change (the Stage camera) reaches consumers as a
 * NEW BINDING IDENTITY through context — surface and overlay re-render in
 * the SAME React commit, so they can never paint a frame apart. No
 * listener sets, no post-commit notifications, no second menu-only render.
 * `subscribe` exists ONLY for genuinely browser-driven invalidation (a
 * PageView moving because the document scrolled), where no state change
 * announces the move.
 */
import * as React from 'react';
import { createContext, useContext, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  projectAnchoredTarget,
  type AnchoredPlacement,
  type AnchorTarget,
  type ViewProjector,
} from '@embedpdf/web';

export type { AnchoredPlacement, AnchorTarget, ViewProjector } from '@embedpdf/web';

/**
 * What a page surface provides via context: the pure projection snapshot,
 * bound to React's reactivity.
 */
export interface ProjectorBinding {
  projector: ViewProjector;
  /**
   * Changes identity exactly when projection may have changed for
   * STATE-driven reasons — the Stage uses its `visiblePages()` value (a
   * stable reference that already folds camera, viewport, scene and DPR).
   * Consumers re-render because the binding's identity changes with it;
   * nothing reads this field, but it is what makes the memoized binding
   * change, so do not "optimize" it away.
   */
  revision: unknown;
  /** Browser-driven invalidation ONLY (PageView scroll/resize — see
   *  `observeClientGeometry`). The Stage deliberately provides none. */
  subscribe?: (callback: () => void) => () => void;
}

const ProjectorContext = createContext<ProjectorBinding | null>(null);

/** Installed by page surfaces (<Stage>, <PageView>) — not by app code. */
export const ProjectorProvider = ProjectorContext.Provider;

/** The surface's projector binding. Reading it subscribes the caller to
 *  projection changes (the binding's identity IS the revision). */
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
  anchor: AnchorTarget | null;
  /** Which side of the anchor to sit on. Default 'top'. */
  placement?: AnchoredPlacement;
  /** Gap in screen px between the anchor box and the content. Default 8. */
  gap?: number;
  children: React.ReactNode;
}

/**
 * Position `children` around a content-space anchor, on whichever page
 * surface is in scope. Projection runs during render from the shared pure
 * helper; pointer isolation keeps a click inside anchored UI from reaching
 * the surface's own listener (which would read it as click-outside).
 */
export function Anchored({ anchor, placement = 'top', gap = 8, children }: AnchoredProps) {
  const { projector, subscribe } = useProjectorBinding();

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

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    return () => el.removeEventListener('pointerdown', stop);
  });

  if (!anchor) return null;
  const pos = projectAnchoredTarget(projector, anchor, placement, gap);
  if (!pos) return null;

  const node = (
    <div
      ref={ref}
      style={{
        position: projector.space === 'client' ? 'fixed' : 'absolute',
        left: pos.left,
        top: pos.top,
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
