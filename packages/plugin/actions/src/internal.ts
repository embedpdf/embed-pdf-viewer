/**
 * The HOST surface: what sibling plugins (stage, annotation, link, form) need
 * to register executors, session sinks, and trigger sources. Same runtime
 * token as the public one, wider type — import from
 * `@embedpdf/plugin-actions/internal`, never from application code.
 */
import { ActionsToken as PublicActionsToken } from './types';
import type { ActionsHostCapability } from './types';
import type { CapabilityToken } from '@embedpdf/core';

export const ActionsToken = PublicActionsToken as CapabilityToken<ActionsHostCapability>;
export type {
  ActionExecutor,
  ActionExecutorResult,
  ActionsHostCapability,
  PageStateReport,
  SessionEffectSink,
} from './types';
