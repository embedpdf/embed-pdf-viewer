/**
 * @embedpdf/vue/anchored: one primitive for every piece of UI that floats over
 * page content (selection menus, annotation menus, badges, popovers).
 *
 * Plugins produce anchors (a page-space box on a page, plus points to keep
 * clear of) as capability reads; the projection contract and the placement
 * math are framework-neutral in `@embedpdf/web`; page surfaces provide a
 * projector binding through `<AnchoredScope>`; `<Anchored>` renders at the
 * projected position.
 */
export { default as Anchored } from './anchored/Anchored.vue';
export { default as AnchoredScope } from './anchored/AnchoredScope.vue';
export {
  provideProjector,
  provideShownPages,
  useOptionalProjectorBinding,
  useProjectorBinding,
  useShownPages,
} from './anchored/projector';
export type { ProjectorBinding, ShownPages } from './anchored/projector';
export type {
  AnchoredPlacement,
  AnchoredSide,
  AnchorTarget,
  PageViewEnv,
  ViewProjector,
} from '@embedpdf/web';
