/**
 * @embedpdf/plugin-render — document-scoped render capability over the engine
 * handle: policy conformance (the one consumer of the deployment render
 * lattice), per-page raster versioning fed by the document event stream, and
 * the tile paint-plan machinery (tiling is a strategy here, not a sibling
 * plugin).
 */
export { renderPlugin } from './render.plugin';
export { RenderToken } from './types';
export type {
  InvalidateScope,
  PaintSettings,
  RenderCapability,
  RenderPluginOptions,
  RenderState,
} from './types';
export type {
  FullPageOptions,
  PageViewDemand,
  TilePaintPlan,
  TilePaintSource,
  TilesOptions,
} from './paint-plan';
