import { definePlugin } from '@embedpdf/core';
import { createRenderCapability } from './capability';
import { registerRenderEffects } from './effects';
import { initialRenderState, renderReducer } from './reducer';
import { RenderToken } from './types';
import type { RenderAction, RenderCapability, RenderPluginOptions, RenderState } from './types';

/**
 * Document-scoped. The ONE policy consumer in the client stack (SCALE-OUT
 * §2.1e): the doc-bind effect resolves the engine's advertised render
 * policy; `renderPage` conforms desired scales to it and collapses
 * same-rung asks in the raster store; the tile manager turns host-supplied
 * demand into a retention-safe paint plan over the SAME store. State is the
 * per-page ledger — raster versions (two doors: the document event stream's
 * built-in map and the `invalidate` verb), the policy latch, and the tile
 * wake-up counter. Layers key on `renderSourceKey`/`tilePlan` and refetch
 * exactly when those change.
 */
export const renderPlugin = (options: RenderPluginOptions = {}) =>
  definePlugin<RenderState, RenderAction, RenderCapability>({
    id: 'render',
    scope: 'document',
    token: RenderToken,
    initialState: initialRenderState,
    reduce: renderReducer,
    capability: (ctx) => createRenderCapability(ctx, options),
    effects: registerRenderEffects,
  });
