import { PluginPackage } from '@embedpdf/core';
import { manifest, BOOKMARK_PLUGIN_ID } from './manifest';
import { BookmarkPluginConfig } from './types';
import { BookmarkPlugin } from './bookmark-plugin';

export const BookmarkPluginPackage: PluginPackage<BookmarkPlugin, BookmarkPluginConfig> = {
  manifest,
  create: (registry, engine) => new BookmarkPlugin(BOOKMARK_PLUGIN_ID, registry, engine),
  reducer: () => {},
  initialState: {},
};

export * from './bookmark-plugin';
export * from './types';
export * from './manifest';
