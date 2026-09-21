import type { PluginContext } from '@embedpdf/core';

import type { AnnotationAction, AnnotationState } from '../model';

/** The kernel context this plugin is built on. Every area takes the members it needs. */
export type AnnotationContext = PluginContext<AnnotationState, AnnotationAction>;
