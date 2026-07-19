import { definePlugin } from '@embedpdf/core';
import { StageToken } from '@embedpdf/plugin-stage';
import { registerPersistEffects } from './effects';
import type { PersistConfig } from './types';

/**
 * An effects-only plugin: no state, no capability. It REQUIRES the Stage (so the
 * kernel fails fast + orders init) and reacts to its view-state. The canonical use
 * of `requires` + `effects`.
 */
export const persistPlugin = (config: PersistConfig) =>
  definePlugin({
    id: 'persist',
    scope: 'document', // each document persists its own view-state
    requires: [StageToken],
    effects: (ctx) => registerPersistEffects(ctx, config),
  });
