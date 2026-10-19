/**
 * What a page surface (`<Stage>`, `<PageView>`) gives the anchored UI inside it: the projection,
 * and the pages it shows. The projection snapshot and the placement math are framework-free, in
 * `@embedpdf/web` ({@link ViewProjector}, `projectAnchoredTarget`).
 *
 * Both are provided as functions that return the current value. A Stage's projection changes on
 * every camera frame (its binding is a `$derived` of the visible pages), so the surface and its
 * overlay update in the same flush and never paint a frame apart.
 */
import { getContext, hasContext, setContext } from 'svelte';
import type { ViewProjector } from '@embedpdf/web';

export interface ProjectorBinding {
  projector: ViewProjector;
  /**
   * Changes whenever projection may have changed for a state reason; the Stage uses its visible
   * pages (a value that already folds camera, viewport, scene and pixel ratio). Readers read it
   * so they compute again; nothing looks inside it.
   */
  revision: unknown;
  /**
   * For changes no state announces, such as a `<PageView>` moving because the document
   * scrolled (see `observeClientGeometry`). The Stage provides none.
   */
  subscribe?: (callback: () => void) => () => void;
}

/**
 * The pages a surface shows right now, by object number. A value of its own, next to the
 * projection, because it changes only when a page comes on screen or leaves it: anchored UI on
 * the other pages reads only this, so it sits out every camera frame.
 */
export type ShownPages = ReadonlySet<number>;

const PROJECTOR = Symbol('embedpdf.projector');
const SHOWN_PAGES = Symbol('embedpdf.shown-pages');

/** For page surfaces: provide the projection to the anchored UI inside. */
export function setProjectorBinding(binding: () => ProjectorBinding): void {
  setContext(PROJECTOR, binding);
}

/** For page surfaces: provide the pages shown. */
export function setShownPages(shown: () => ShownPages): void {
  setContext(SHOWN_PAGES, shown);
}

/** The surface's projection, or null outside any page surface, for chrome that degrades instead of throwing. */
export function useOptionalProjectorBinding(): (() => ProjectorBinding) | null {
  return hasContext(PROJECTOR) ? getContext<() => ProjectorBinding>(PROJECTOR) : null;
}

/** The surface's projection. Throws outside a page surface. */
export function useProjectorBinding(): () => ProjectorBinding {
  const binding = useOptionalProjectorBinding();
  if (!binding) {
    throw new Error(
      '[embedpdf] No ViewProjector in scope: put anchored UI in a <Stage> (its overlay snippet) or a <PageView>.',
    );
  }
  return binding;
}

/** The pages the surface shows, or null outside one (then every page counts as shown). */
export function useShownPages(): (() => ShownPages) | null {
  return hasContext(SHOWN_PAGES) ? getContext<() => ShownPages>(SHOWN_PAGES) : null;
}
