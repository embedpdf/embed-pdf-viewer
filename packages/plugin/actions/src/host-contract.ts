/** Host-typed actions token and registration protocol for sibling plugins. */
import type { CapabilityToken } from '@embedpdf/core';

import { ActionsToken as PublicActionsToken } from './types';
import type { ActionsHostCapability } from './types';

export const ActionsToken = PublicActionsToken as CapabilityToken<ActionsHostCapability>;
export type {
  ActionExecutor,
  ActionExecutorResult,
  ActionsHostCapability,
  PageStateReport,
  SessionEffectSink,
} from './types';
