import { definePlugin } from '@embedpdf/core';
import type { RenderConfig } from './contract';
import { createRenderController } from './controller';
import { RenderToken, type RenderHostCapability } from './host-contract';
import { initialRenderState, type RenderState } from './model';

/**
 * Document-scoped page rasters. The only render-policy consumer in the
 * client stack: the kernel materializes the engine's advertised render
 * policy on the document, the controller conforms desired scales to it and
 * collapses same-key asks in its raster store, and the tile manager turns
 * host-supplied demand into a retention-safe paint plan over the same store.
 * State is the per-page raster-version ledger.
 */
export const renderPlugin = (config: RenderConfig = {}) =>
  definePlugin<RenderState, RenderHostCapability>({
    id: 'render',
    scope: 'document',
    token: RenderToken,
    state: initialRenderState,
    create: (ctx) => createRenderController(ctx, config),
  });
