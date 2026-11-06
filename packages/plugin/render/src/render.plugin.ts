import { definePlugin } from '@embedpdf/core';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { RENDER_DEFAULTS, type RenderConfig } from './contract';
import { createRenderController } from './controller';
import { RenderToken } from './host-contract';
import { initialRenderState } from './model';

/**
 * Document-scoped page rasters. The only render-policy consumer in the
 * client stack: the kernel materializes the engine's advertised render
 * policy on the document, the controller conforms desired scales to it and
 * collapses same-key asks in its raster store, and the tile manager turns
 * host-supplied demand into a retention-safe paint plan over the same store.
 * State is the per-page raster-version ledger and the snapshot tool's box.
 * The interaction plugin is optional: with it, the plugin adds the
 * `snapshot` tool.
 */
export const renderPlugin = (config?: RenderConfig) =>
  definePlugin({
    id: 'render',
    scope: 'document',
    token: RenderToken,
    optional: [InteractionToken],
    state: initialRenderState,
    settings: { defaults: RENDER_DEFAULTS, registered: config, whole: ['snapshot.box'] },
    create: createRenderController,
  });
