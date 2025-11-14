import { PluginManifest } from '@embedpdf/core';
import { DocumentManagerPluginConfig } from './types';

export const DOCUMENT_MANAGER_PLUGIN_ID = 'document-manager';

export const manifest: PluginManifest<DocumentManagerPluginConfig> = {
  id: DOCUMENT_MANAGER_PLUGIN_ID,
  name: 'Document Manager Plugin',
  version: '1.0.0',
  provides: ['document-manager'],
  requires: [],
  optional: [],
  defaultConfig: {
    enabled: true,
    maxDocuments: 10,
  },
};
