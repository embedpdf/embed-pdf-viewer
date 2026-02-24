import { PluginManifest } from '@embedpdf/core';
import { AttachmentPluginConfig } from './types';

export const ATTACHMENT_PLUGIN_ID = 'attachment';

export const manifest: PluginManifest<AttachmentPluginConfig> = {
  id: ATTACHMENT_PLUGIN_ID,
  name: 'Attachment Plugin',
  version: '1.0.0',
  provides: ['attachment'],
  requires: [],
  optional: [],
  defaultConfig: {},
};
