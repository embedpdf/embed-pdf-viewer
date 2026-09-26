import { definePlugin } from '@embedpdf/core';
import type { RenderConfig } from './contract';
import { createRenderController } from './controller';
import { RenderToken, type RenderHostCapability } from './host-contract';
import { initialRenderState, reduceRender, type RenderAction, type RenderState } from './model';

/**
 * Document-scoped. The ONE policy consumer in the client stack: the kernel
 * materializes the engine's advertised render policy on the document, the
 * controller conforms desired scales to it and collapses same-key asks in
 * its raster store, and the tile manager turns host-supplied demand into a
 * retention-safe paint plan over the SAME store. State is the per-page
 * ledger — raster versions (two doors: the document event stream's built-in
 * map and the `invalidate` verb) and the tile wake-up counter.
 */
export const renderPlugin = (config: RenderConfig = {}) =>
  definePlugin<RenderState, RenderAction, RenderHostCapability>({
    id: 'render',
    scope: 'document',
    token: RenderToken,
    initialState: initialRenderState,
    reduce: reduceRender,
    create: (ctx) => createRenderController(ctx, config),
  });
