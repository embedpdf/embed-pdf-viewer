import { PluginManifest } from '@embedpdf/core';
import { BookmarkPluginConfig } from './types';

export const BOOKMARK_PLUGIN_ID = 'bookmark';

export const manifest: PluginManifest<BookmarkPluginConfig> = {
  id: BOOKMARK_PLUGIN_ID,
  name: 'Bookmark Plugin',
  version: '1.0.0',
  provides: ['bookmark'],
  requires: [],
  optional: [],
  defaultConfig: {},
};
