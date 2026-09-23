import { definePlugin } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';

import { StampToken, type StampCapability, type StampConfig } from './contract';
import { createStampController } from './controller';
import { initialStampState, type StampState } from './model';

/**
 * Stamp libraries and assets. Workspace-scoped: libraries outlive any one
 * document; placement targets a document through its annotation plugin.
 */
export const stampPlugin = (config: StampConfig = {}) =>
  definePlugin<StampState, StampCapability>({
    id: 'stamp',
    token: StampToken,
    scope: 'workspace',
    optional: [AnnotationToken, ActionsToken],
    state: initialStampState,
    create: (ctx) => createStampController(ctx, config),
  });
