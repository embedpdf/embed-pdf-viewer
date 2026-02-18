import { PluginPackage } from '@embedpdf/core';

import { LayoutAnalysisPlugin } from './layout-analysis-plugin';
import { manifest, LAYOUT_ANALYSIS_PLUGIN_ID } from './manifest';
import { LayoutAnalysisPluginConfig, LayoutAnalysisState } from './types';
import { reducer, initialState } from './reducer';
import { LayoutAnalysisAction } from './actions';

export const LayoutAnalysisPluginPackage: PluginPackage<
  LayoutAnalysisPlugin,
  LayoutAnalysisPluginConfig,
  LayoutAnalysisState,
  LayoutAnalysisAction
> = {
  manifest,
  create: (registry, config) =>
    new LayoutAnalysisPlugin(LAYOUT_ANALYSIS_PLUGIN_ID, registry, config),
  reducer,
  initialState,
};

export * from './layout-analysis-plugin';
export * from './types';
export * from './manifest';
export * from './coordinate-mapper';
export * from './merge-utils';
