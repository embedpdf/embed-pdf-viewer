import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { createStampCapability } from './capability';
import { initialStampState, stampReducer } from './reducer';
import { StampToken } from './types';
import type { StampAction, StampConfig, StampHostCapability, StampState } from './types';

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
    create: (ctx) => ({ api: createStampCapability(ctx, config) }),
  });
