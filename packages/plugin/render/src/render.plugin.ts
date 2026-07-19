import { definePlugin } from '@embedpdf/core';
import { createRenderCapability } from './capability';
import { registerRenderEffects } from './effects';
import { initialRenderState, renderReducer } from './reducer';
import { RenderToken } from './types';
import type { RenderAction, RenderCapability, RenderState } from './types';

/**
 * Document-scoped. `renderPage` is a stateless pass-through to the engine
 * handle; the state is one thing only — per-page versions of the two raster
 * products (base / annotated), fed through two doors: the document event
 * stream (built-in map, effects.ts) and the `invalidate` verb (facts the map
 * doesn't know — redaction, text edit, third-party plugins). Layers key on
 * `renderEpoch(pon)` and refetch when it bumps.
 */
export const renderPlugin = () =>
  definePlugin<RenderState, RenderAction, RenderCapability>({
    id: 'render',
    scope: 'document',
    token: RenderToken,
    initialState: initialRenderState,
    reduce: renderReducer,
    capability: createRenderCapability,
    effects: registerRenderEffects,
  });
