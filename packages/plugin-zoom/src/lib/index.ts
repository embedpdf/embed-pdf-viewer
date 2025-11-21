import { PluginPackage } from '@embedpdf/core';

import { ZoomAction } from './actions';
import { manifest, ZOOM_PLUGIN_ID } from './manifest';
import { zoomReducer, initialState, initialDocumentState } from './reducer';
import { ZoomPluginConfig, ZoomState } from './types';
import { ZoomPlugin } from './zoom-plugin';

export const ZoomPluginPackage: PluginPackage<ZoomPlugin, ZoomPluginConfig, ZoomState, ZoomAction> =
  {
    manifest,
    create: (registry, config) => new ZoomPlugin(ZOOM_PLUGIN_ID, registry, config),
    reducer: zoomReducer,
    initialState,
  };

export * from './zoom-plugin';
export * from './types';
export * from './manifest';
export { initialState, initialDocumentState };
