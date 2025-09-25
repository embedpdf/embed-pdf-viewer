import { PluginPackage } from '@embedpdf/core';
import { manifest, ANNOTATION_PLUGIN_ID } from './manifest';
import { AnnotationPluginConfig, AnnotationState } from './types';
import { AnnotationPlugin } from './annotation-plugin';
import { initialState, reducer } from './reducer';
import { AnnotationAction } from './actions';

export const AnnotationPluginPackage: PluginPackage<
  AnnotationPlugin,
  AnnotationPluginConfig,
  AnnotationState,
  AnnotationAction
> = {
  manifest,
  create: (registry, config) => new AnnotationPlugin(ANNOTATION_PLUGIN_ID, registry, config),
  reducer,
  initialState: (_, config) => initialState(config),
};

export * from './annotation-plugin';
export * from './types';
export * from './manifest';
export * from './selectors';
export * from './helpers';
export * from './handlers/types';
export * from './tools/types';
export * from './tools/tools-utils';
export * as patching from './patching';
