/**
 * @embedpdf/plugin-render — document-scoped render capability over the engine
 * handle, plus per-page raster versioning fed by the document event stream.
 * Standard layout: types.ts · reducer.ts · capability.ts · effects.ts · render.plugin.ts.
 */
export { renderPlugin } from './render.plugin';
export { RenderToken } from './types';
export type { InvalidateScope, RenderCapability, RenderState } from './types';
