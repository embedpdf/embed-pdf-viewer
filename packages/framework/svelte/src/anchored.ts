/**
 * @embedpdf/svelte/anchored — UI that floats over page content.
 *
 * Plugins give anchors (a page-space box on a page, and points to keep clear of); `<Anchored>`
 * places content next to one, on whichever page surface it's in: a `<Stage>`'s overlay, or a
 * `<PageView>`. The placement math is framework-free, in `@embedpdf/web`.
 */
export type {
  AnchoredPlacement,
  AnchoredSide,
  AnchorTarget,
  PageViewEnv,
  ViewProjector,
} from '@embedpdf/web';

export { default as Anchored } from './anchored/Anchored.svelte';
export type { AnchoredProps } from './anchored/props';
export {
  setProjectorBinding,
  setShownPages,
  useOptionalProjectorBinding,
  useProjectorBinding,
  useShownPages,
} from './anchored/context';
export type { ProjectorBinding, ShownPages } from './anchored/context';
