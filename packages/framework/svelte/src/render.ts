/**
 * @embedpdf/svelte/render — the page raster.
 *
 * `<RenderLayer>` draws a page's picture inside a `<Stage>` page or a `<PageView>`; the readers
 * are the render plugin's API, settings and events, for thumbnails and previews of your own, and
 * `usePictureState()` for a page's loading indicator.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-render';

export { default as RenderLayer } from './render/RenderLayer.svelte';
export type { RenderLayerProps } from './render/props';
export {
  usePictureState,
  useRender,
  useRenderEvent,
  useRenderSettings,
} from './render/readers.svelte';
