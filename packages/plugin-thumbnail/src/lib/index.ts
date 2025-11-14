import { PluginPackage } from '@embedpdf/core';
import { manifest, THUMBNAIL_PLUGIN_ID } from './manifest';
import { ThumbnailPluginConfig, ThumbnailState } from './types';
import { ThumbnailPlugin } from './thumbnail-plugin';
import { thumbnailReducer, initialState } from './reducer';
import { ThumbnailAction } from './actions';

export const ThumbnailPluginPackage: PluginPackage<
  ThumbnailPlugin,
  ThumbnailPluginConfig,
  ThumbnailState,
  ThumbnailAction
> = {
  manifest,
  create: (registry, config) => new ThumbnailPlugin(THUMBNAIL_PLUGIN_ID, registry, config),
  reducer: thumbnailReducer,
  initialState,
};

export * from './thumbnail-plugin';
export * from './types';
export * from './manifest';
export * from './actions';
export * from './reducer';
