/**
 * @embedpdf/svelte/render — the page raster.
 *
 * `<RenderLayer>` draws a page's picture inside a `<Stage>` page or a `<PageView>`, and
 * `<SnapshotLayer>` the snapshot tool's box on it, with `<SnapshotMenu>` beside it. The readers are the render plugin's API,
 * settings and events, for thumbnails and previews of your own, `usePictureState()` for a
 * page's loading indicator, and `useSnapshot()` for the snapshot the tool holds.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-render';

export { default as RenderLayer } from './render/RenderLayer.svelte';
export { default as SnapshotLayer } from './render/SnapshotLayer.svelte';
export { default as SnapshotMenu } from './render/SnapshotMenu.svelte';
export type { RenderLayerProps, SnapshotMenuProps } from './render/props';
export {
  usePictureState,
  useRender,
  useRenderEvent,
  useRenderSettings,
  useSnapshot,
} from './render/readers.svelte';
