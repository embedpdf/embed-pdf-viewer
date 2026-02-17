import { PluginManifest } from '@embedpdf/core';
import { LayoutAnalysisPluginConfig } from './types';

export const LAYOUT_ANALYSIS_PLUGIN_ID = 'layout-analysis';

export const manifest: PluginManifest<LayoutAnalysisPluginConfig> = {
  id: LAYOUT_ANALYSIS_PLUGIN_ID,
  name: 'Layout Analysis Plugin',
  version: '1.0.0',
  provides: ['layout-analysis'],
  requires: ['render', 'ai-manager'],
  optional: [],
  defaultConfig: {
    threshold: 0.35,
    tableStructure: false,
    autoAnalyze: false,
    renderScale: 2.0,
  },
};
