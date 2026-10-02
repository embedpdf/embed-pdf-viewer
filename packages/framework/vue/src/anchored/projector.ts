/**
 * How anchored UI finds where to sit. A page surface (`<Stage>`'s overlay)
 * provides a {@link ProjectorBinding}: the projection snapshot plus Vue's way
 * of knowing it changed, and the pages it shows. The placement math is shared,
 * framework-neutral, in `@embedpdf/web` (`projectAnchoredTarget`).
 *
 * The scheduling law that keeps menus glued to the content: a state-driven
 * projection change (the Stage camera) reaches anchored UI as a new binding
 * value in the same update that moves the pages, so the two never paint a
 * frame apart. `subscribe` exists only for browser-driven invalidation (a
 * surface that moves because the document scrolled), which no state change
 * announces.
 */
import { inject, provide } from 'vue';
import type { InjectionKey, Ref } from 'vue';
import type { ViewProjector } from '@embedpdf/web';

/** What a page surface provides: the pure projection snapshot, bound to Vue's reactivity. */
export interface ProjectorBinding {
  projector: ViewProjector;
  /**
   * Changes exactly when projection may have changed for state-driven reasons:
   * the Stage uses its visible pages (one value that already folds camera,
   * viewport, scene and pixel ratio). Nothing reads it; it is what makes the
   * binding a new value, so don't leave it out.
   */
  revision: unknown;
  /** Browser-driven invalidation only (a surface the document's scroll moves). The Stage provides none. */
  subscribe?: (callback: () => void) => () => void;
}

/**
 * The pages a surface shows right now, by object number. A value of its own,
 * next to the projection, because it changes only when a page comes on screen
 * or leaves it: anchored UI on the other pages reads only this, so it sits out
 * every camera frame.
 */
export type ShownPages = ReadonlySet<number>;

const ProjectorKey: InjectionKey<Readonly<Ref<ProjectorBinding>>> = Symbol('embedpdf projector');
const ShownPagesKey: InjectionKey<Readonly<Ref<ShownPages>>> = Symbol('embedpdf shown pages');

/** Installed by page surfaces (through `<AnchoredScope>`), not by app code. */
export function provideProjector(binding: Readonly<Ref<ProjectorBinding>>): void {
  provide(ProjectorKey, binding);
}

/** Installed by page surfaces (through `<AnchoredScope>`), not by app code. */
export function provideShownPages(shown: Readonly<Ref<ShownPages>>): void {
  provide(ShownPagesKey, shown);
}

/** The surface's projector binding, or null outside any page surface: for chrome that degrades instead of throwing. */
export function useOptionalProjectorBinding(): Readonly<Ref<ProjectorBinding>> | null {
  return inject(ProjectorKey, null);
}

/** The surface's projector binding. Reading its value makes a render follow projection changes. */
export function useProjectorBinding(): Readonly<Ref<ProjectorBinding>> {
  const binding = useOptionalProjectorBinding();
  if (!binding) {
    throw new Error(
      "No ViewProjector in scope: mount anchored UI in a <Stage>'s #overlay slot.",
    );
  }
  return binding;
}

/** The pages the surface shows, or null outside a surface that says. */
export function useShownPages(): Readonly<Ref<ShownPages>> | null {
  return inject(ShownPagesKey, null);
}
