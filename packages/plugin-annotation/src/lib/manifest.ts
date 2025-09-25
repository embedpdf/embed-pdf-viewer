import { PluginManifest } from '@embedpdf/core';
import { AnnotationPluginConfig } from './types';

export const ANNOTATION_PLUGIN_ID = 'annotation';

export const manifest: PluginManifest<AnnotationPluginConfig> = {
  id: ANNOTATION_PLUGIN_ID,
  name: 'Annotation Plugin',
  version: '1.0.0',
  provides: ['annotation'],
  requires: ['interaction-manager', 'selection'],
  optional: ['history'],
  defaultConfig: {
    enabled: true,
    autoCommit: true,
    annotationAuthor: 'Guest',
    deactivateToolAfterCreate: false,
    selectAfterCreate: true,
  },
};
