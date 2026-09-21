import { definePlugin } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';

import type { StampConfig } from './contract';
import { createStampController } from './controller';
import { StampToken } from './host-contract';
import type { StampHostCapability } from './host-contract';
import { initialStampState, stampReducer } from './model';
import type { StampAction, StampState } from './model';

/**
 * Stamp libraries and assets — WORKSPACE-scoped (libraries outlive any one
 * document); placement targets a document through its annotation plugin.
 */
export const stampPlugin = (config: StampConfig = {}) =>
  definePlugin<StampState, StampAction, StampHostCapability>({
    id: 'stamp',
    token: StampToken,
    scope: 'workspace',
    optional: [AnnotationToken, ActionsToken],
    initialState: initialStampState,
    reduce: stampReducer,
    create: (ctx) => ({ api: createStampController(ctx, config) }),
  });
