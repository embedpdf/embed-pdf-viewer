import type { PluginContext } from '@embedpdf/core';

import type { AnnotationSettings } from '../contract';
import type { AnnotationModel } from '../model';

/** The kernel context this plugin is built on. Every area takes the members it needs. */
export type AnnotationContext = PluginContext<AnnotationModel, AnnotationSettings>;
